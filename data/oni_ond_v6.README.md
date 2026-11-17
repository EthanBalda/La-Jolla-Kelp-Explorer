# October–December ONI, ERSSTv6

Source: NOAA Climate Prediction Center, historical ONI v6 table,
https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/oni/v6/

Retrieved 2026-11-13. `oni_ond_v6.csv` transcribes the **OND** column for
1995–2025 exactly as published, at the table's one-decimal precision.
It does not use the adjacent SON or NDJ columns. `quarter=4` identifies OND;
the join uses the calendar year of October–December. Units are degrees Celsius.
Blank values represent missing ONI and must never be interpreted as zero.

ONI is a three-month mean sea-surface temperature anomaly in the tropical
Pacific Niño 3.4 region, using NOAA's changing centered seasonal baselines.
It is a different measurement from the local La Jolla surface-temperature
anomaly plotted on the x-axis. Historical values can be revised; this local
snapshot makes the current exploratory overlay reproducible.

The overlay's single-season threshold is OND ONI >= +0.5 °C. Call it
**El Niño-like falls**, not an official El Niño episode classification.
**Below the cutoff** includes both neutral and La Niña-like falls. Missing
ONI is excluded from both subgroups but never from the all-falls plot or fit.
The missing 1995 Q4 kelp observation is excluded from paired calculations
independently of its available ONI value.
