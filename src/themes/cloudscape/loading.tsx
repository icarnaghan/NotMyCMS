import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";

export function Loading({ centered }: { centered?: boolean }) {
  if (!centered) return <Spinner size="large" />;
  return (
    <Box textAlign="center" padding="xxl">
      <Spinner size="large" />
    </Box>
  );
}
