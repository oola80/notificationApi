"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  FlaskConical,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  Button,
  Textarea,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
} from "@/components/ui";
import { useTestMapping } from "@/hooks/use-mappings";

const SAMPLE_PAYLOAD = JSON.stringify(
  {
    data: {
      orderNumber: "ORD-12345",
      customer: {
        email: "jane@example.com",
        name: "Jane Doe",
      },
      total: 79.99,
      currency: "USD",
      timestamp: "2026-02-28T10:00:00Z",
    },
  },
  null,
  2,
);

interface MappingTestPanelProps {
  mappingId: string;
}

function MappingTestPanel({ mappingId }: MappingTestPanelProps) {
  const [rawInput, setRawInput] = React.useState(SAMPLE_PAYLOAD);
  const [output, setOutput] = React.useState<string>("");
  const [testErrors, setTestErrors] = React.useState<string[]>([]);
  const [testSuccess, setTestSuccess] = React.useState<boolean | null>(null);

  const { trigger: runTest, isMutating: isTesting } =
    useTestMapping(mappingId);

  const handleRunTest = async () => {
    // Validate JSON
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawInput);
    } catch {
      toast.error("Invalid JSON payload");
      return;
    }

    setOutput("");
    setTestErrors([]);
    setTestSuccess(null);

    try {
      const result = await runTest({ samplePayload: parsed });
      const success = result.missingRequiredFields.length === 0;
      setTestSuccess(success);
      if (result.canonicalEvent) {
        setOutput(JSON.stringify(result.canonicalEvent, null, 2));
      }
      const allIssues = [
        ...result.missingRequiredFields.map((f) => `Missing required field: ${f}`),
        ...result.warnings,
      ];
      if (allIssues.length > 0) {
        setTestErrors(allIssues);
      }
      if (success) {
        toast.success("Mapping test passed");
      } else {
        toast.error("Mapping test failed");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to test mapping",
      );
      setTestSuccess(false);
      setTestErrors([
        err instanceof Error ? err.message : "Unknown error occurred",
      ]);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5" />
          Test Mapping
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Sample Payload (JSON)
            </label>
            <Textarea
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              rows={16}
              className="font-mono text-sm"
              placeholder="Enter a JSON payload to test..."
            />
          </div>

          {/* Output */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Normalized Output
            </label>
            <Textarea
              value={output}
              readOnly
              rows={16}
              className="font-mono text-sm bg-muted"
              placeholder="Run the test to see the normalized output..."
            />
          </div>
        </div>

        {/* Status bar */}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleRunTest} disabled={isTesting}>
            {isTesting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="mr-2 h-4 w-4" />
            )}
            Run Test
          </Button>

          {testSuccess !== null && (
            <div className="flex items-center gap-2">
              {testSuccess ? (
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Passed
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Failed
                </Badge>
              )}
            </div>
          )}

          {testErrors.length > 0 && (
            <span className="text-sm text-destructive">
              {testErrors.length} error{testErrors.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Error details */}
        {testErrors.length > 0 && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
            <p className="mb-1 text-sm font-medium text-destructive">
              Errors:
            </p>
            <ul className="list-inside list-disc space-y-1 text-sm text-destructive">
              {testErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { MappingTestPanel };
