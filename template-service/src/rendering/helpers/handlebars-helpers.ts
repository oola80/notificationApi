import Handlebars from 'handlebars';
import dayjs from 'dayjs';

export function registerHandlebarsHelpers(): void {
  Handlebars.registerHelper(
    'formatCurrency',
    (amount: number, code: string) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: String(code),
      }).format(amount);
    },
  );

  Handlebars.registerHelper('formatDate', (date: string, pattern: string) => {
    return dayjs(date).format(String(pattern));
  });

  Handlebars.registerHelper('uppercase', (text: unknown) => {
    return String(text ?? '').toUpperCase();
  });

  Handlebars.registerHelper('lowercase', (text: unknown) => {
    return String(text ?? '').toLowerCase();
  });

  Handlebars.registerHelper(
    'truncate',
    (text: unknown, length: number) => {
      const str = String(text ?? '');
      if (str.length <= length) {
        return str;
      }
      return str.substring(0, length) + '...';
    },
  );

  Handlebars.registerHelper('eq', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
    if (a === b) {
      return options.fn(this);
    }
    return options.inverse(this);
  });

  Handlebars.registerHelper('gt', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
    if (Number(a) > Number(b)) {
      return options.fn(this);
    }
    return options.inverse(this);
  });

  Handlebars.registerHelper(
    'default',
    (value: unknown, fallback: unknown) => {
      return value || fallback;
    },
  );
}
