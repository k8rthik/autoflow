# Stratum — Series B Investment Memo

- **Company:** Stratum (observability for data pipelines)
- **Round:** $30M Series B, $180M post. Proposed check: $8M.
- **Prepared by:** Infrastructure team

## Thesis in one line

Data teams have no equivalent of application monitoring, Stratum has become the default for companies on the modern data stack, and its usage-based pricing scales with customer data volume.

## Market

- Companies spent an estimated $9B on data infrastructure tooling in 2025, and the pipeline-reliability slice of that is growing faster than the rest at roughly 35% a year.
- Every one of the 40 data leaders we interviewed said pipeline failures are found by downstream consumers, not by the data team, and 32 of them said they have no tool for this today.

## Product

- Stratum instruments pipelines at the orchestration layer, so it works across dbt, Airflow, Dagster and Spark without code changes.
- Median time to detect a broken pipeline dropped from 9 hours to 12 minutes across the customers who shared before-and-after data.
- The anomaly models are trained on each customer's own history, and customers report fewer than one false alert per day per hundred pipelines.

## Business

- ARR is $11M, up from $3.5M a year ago.
- 145 customers; net revenue retention is 150%, driven by pricing on data volume monitored.
- Gross margin is 78%.
- Sales efficiency: magic number of 1.3 over the last two quarters.
- Payback on customer acquisition is 14 months.

## Team

- CEO and CTO were early engineers on the data platform team at a large ride-hailing company and built its internal pipeline monitoring, which is the direct ancestor of this product.
- VP Sales joined from a public observability company where she ran the mid-market segment.

## Competition

- Application-monitoring incumbents sell to SREs, not data teams, and their data-quality features are check-boxes rather than products.
- The two direct competitors are both earlier and smaller; the larger of them has about a third of Stratum's ARR.

## Why we might be wrong

- Snowflake and Databricks could ship native monitoring that is good enough for most customers.
- Usage-based pricing means revenue falls if customers reduce data volume in a downturn.
- The category may be a feature of the orchestrator, not a standalone product.

## Recommendation

Invest $8M. Stratum is the clear category leader with strong unit economics and a founding team that has built this exact system before.
