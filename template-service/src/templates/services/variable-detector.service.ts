import { Injectable } from '@nestjs/common';
import Handlebars from 'handlebars';

const BUILTIN_HELPERS = new Set([
  'formatCurrency',
  'formatDate',
  'uppercase',
  'lowercase',
  'truncate',
  'eq',
  'gt',
  'default',
  'if',
  'each',
  'unless',
  'with',
  'lookup',
  'log',
]);

@Injectable()
export class VariableDetectorService {
  detectVariables(
    channelContents: { subject?: string; body: string }[],
  ): string[] {
    const variables = new Set<string>();

    for (const content of channelContents) {
      if (content.subject) {
        this.extractFromTemplate(content.subject, variables);
      }
      this.extractFromTemplate(content.body, variables);
    }

    return Array.from(variables).sort();
  }

  private extractFromTemplate(
    template: string,
    variables: Set<string>,
  ): void {
    const ast = Handlebars.parse(template);
    this.walkNode(ast, variables);
  }

  private walkNode(node: hbs.AST.Node, variables: Set<string>): void {
    if (!node) return;

    switch (node.type) {
      case 'Program':
        (node as hbs.AST.Program).body.forEach((n) =>
          this.walkNode(n, variables),
        );
        break;

      case 'MustacheStatement': {
        const mustache = node as hbs.AST.MustacheStatement;
        if (mustache.params.length === 0) {
          this.extractPath(mustache.path, variables);
        } else {
          mustache.params.forEach((p) => this.extractPath(p, variables));
          if (mustache.hash) {
            mustache.hash.pairs.forEach((pair) =>
              this.extractPath(pair.value, variables),
            );
          }
        }
        break;
      }

      case 'BlockStatement': {
        const block = node as hbs.AST.BlockStatement;
        block.params.forEach((p) => this.extractPath(p, variables));
        if (block.hash) {
          block.hash.pairs.forEach((pair) =>
            this.extractPath(pair.value, variables),
          );
        }
        if (block.program) this.walkNode(block.program, variables);
        if (block.inverse) this.walkNode(block.inverse, variables);
        break;
      }

      case 'ContentStatement':
      case 'CommentStatement':
        break;

      default:
        break;
    }
  }

  private extractPath(node: hbs.AST.Node, variables: Set<string>): void {
    if (node.type === 'PathExpression') {
      const path = node as hbs.AST.PathExpression;
      const name = path.original;
      if (
        !BUILTIN_HELPERS.has(name) &&
        !name.startsWith('@') &&
        name !== 'this'
      ) {
        variables.add(name);
      }
    }
  }
}
