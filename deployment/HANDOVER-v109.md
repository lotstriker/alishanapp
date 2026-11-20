# v109 handover

ZIP: AlishanApp-v109-Performance-Insights.zip. Version log entry: ALISHAN-CHG-2026-11-20-009. User Guide topic 30 describes the visit modes.

Page Performance adds visit and minimum-duration filters, grouped counts and timings, and a measured-phase chart for individual visits. New telemetry stores mode and route preparation in the existing metrics document. Legacy rows with document metrics can be recognized as document loads. First and repeat legacy SPA visits cannot be separated retroactively.

Route preparation includes the user-visible wait to acquire the route HTML and script. The phase chart shows distinct measurements that can overlap. It does not infer a specific hosting or network bottleneck. Real Android v109 visits must be collected after deployment.
