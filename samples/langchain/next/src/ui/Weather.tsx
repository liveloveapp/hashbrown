import React from 'react';
import styles from './Weather.module.css';
import { exposeComponent } from '@hashbrownai/react';
import { s } from '@hashbrownai/core';
import { IconWindBarb } from '../components/icons/IconWindBarb';

type WeatherProps = {
  icao: string;
  metar: string;
  taf: string;
  ceilingFt: number | null;
  visibilitySm: number;
  summary: string;
  windDirectionDeg: number;
  windSpeedKt: number;
  temperatureC: number;
  dewpointC: number;
  altimeterInHg: number;
};

type FlightCategory = 'VFR' | 'MVFR' | 'IFR' | 'LIFR';

function getFlightCategory(
  ceilingFt: number | null,
  visibilitySm: number,
): FlightCategory {
  // Standard-ish FAA thresholds
  const vis = visibilitySm;

  if ((ceilingFt !== null && ceilingFt < 500) || vis < 1) return 'LIFR';
  if ((ceilingFt !== null && ceilingFt < 1000) || vis <= 3) return 'IFR';
  if ((ceilingFt !== null && ceilingFt <= 3000) || vis <= 5) return 'MVFR';
  return 'VFR';
}

function getFlightCategoryDescription(cat: FlightCategory): string {
  switch (cat) {
    case 'VFR':
      return 'Ceiling ≥ 3,000 ft and vis > 5 SM';
    case 'MVFR':
      return 'Ceiling 1,000-3,000 ft or vis 3-5 SM';
    case 'IFR':
      return 'Ceiling 500-<1,000 ft or vis 1-3 SM';
    case 'LIFR':
      return 'Ceiling < 500 ft or vis < 1 SM';
  }
}

function Weather({
  icao,
  metar,
  taf,
  ceilingFt,
  visibilitySm,
  summary,
  windDirectionDeg,
  windSpeedKt,
  temperatureC,
  dewpointC,
  altimeterInHg,
}: WeatherProps) {
  const category = getFlightCategory(ceilingFt, visibilitySm);

  const windLabel =
    windDirectionDeg == null || windSpeedKt == null
      ? 'Calm / N/A'
      : `${Math.round(windDirectionDeg).toString().padStart(3, '0')}° @ ${windSpeedKt} kt`;

  const hasWind = windDirectionDeg != null && windSpeedKt != null;
  const windBarbProps = {
    speedKnots: windSpeedKt ?? 0,
    directionDegrees: windDirectionDeg ?? 0,
  };

  const tempSpread =
    temperatureC != null && dewpointC != null
      ? `${temperatureC}° / ${dewpointC}°C`
      : 'N/A';

  const pressureLabel =
    altimeterInHg != null ? `${altimeterInHg.toFixed(2)} inHg` : 'N/A';

  const skyLabel =
    summary ?? (ceilingFt == null ? 'No ceiling' : `${ceilingFt} ft ceiling`);

  return (
    <section className={styles.card} aria-label={`Weather for ${icao}`}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.ident}>
          <span className={styles.label}>Airport</span>
          <div className={styles.icaoRow}>
            <span className={styles.icao}>{icao}</span>
          </div>
        </div>

        <div className={styles.category}>
          <span className={`${styles.categoryBadge} ${styles[category]}`}>
            {category}
          </span>
          <span className={styles.categoryDescription}>
            {getFlightCategoryDescription(category)}
          </span>
        </div>
      </header>

      {/* Main grid */}
      <div className={styles.mainGrid}>
        {/* Left column: conditions */}
        <div className={styles.conditionsColumn}>
          <div className={styles.conditionBlock}>
            <span className={styles.blockValue}>{skyLabel}</span>
          </div>

          <div className={styles.conditionRow}>
            <div className={styles.conditionBlock}>
              <span className={styles.blockLabel}>Visibility</span>
              <span className={styles.blockValue}>
                {visibilitySm.toFixed(0)} SM
              </span>
            </div>

            <div className={styles.conditionBlock}>
              <span className={styles.blockLabel}>Altimeter</span>
              <span className={styles.blockValue}>{pressureLabel}</span>
            </div>
          </div>

          <div className={styles.conditionRow}>
            <div className={styles.conditionBlock}>
              <span className={styles.blockLabel}>Temp / Dew</span>
              <span className={styles.blockValue}>{tempSpread}</span>
            </div>

            <div className={styles.conditionBlock}>
              <span className={styles.blockLabel}>Ceiling</span>
              <span className={styles.blockValue}>
                {ceilingFt == null ? '-' : `${ceilingFt} ft AGL`}
              </span>
            </div>
          </div>
        </div>

        {/* Right column: wind */}
        <div className={styles.windColumn}>
          <div className={styles.windCard}>
            <div className={styles.windBarbWrapper}>
              <IconWindBarb
                {...windBarbProps}
                size={96}
                color="var(--sunset-orange, rgba(232, 140, 77, 1))"
                className={styles.windBarb}
                aria-hidden={!hasWind}
              />
            </div>
            <div className={styles.windText}>
              <span className={styles.windPrimary}>{windLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Raw METAR / TAF */}
      <footer className={styles.footer}>
        <div className={styles.footerBlock}>
          <code className={styles.code}>{metar}</code>
        </div>
        {taf && (
          <div className={styles.footerBlock}>
            <code className={styles.code}>{taf}</code>
          </div>
        )}
      </footer>
    </section>
  );
}

Weather.displayName = 'Weather';

const exposedWeather = exposeComponent(Weather, {
  name: 'Weather',
  description: 'Show weather information to the user',
  props: {
    icao: s.string('The ICAO code of the airport'),
    metar: s.string('The METAR weather report'),
    taf: s.string('The TAF weather forecast'),
    ceilingFt: s.anyOf([
      s.number('The ceiling height in feet, or null if there is no ceiling'),
      s.nullish(),
    ]),
    visibilitySm: s.number('The visibility in statute miles'),
    summary: s.string('The summary of the weather'),
    windDirectionDeg: s.number('Wind direction in degrees true'),
    windSpeedKt: s.number('Wind speed in knots'),
    temperatureC: s.number('Temperature in Celsius'),
    dewpointC: s.number('Dewpoint in Celsius'),
    altimeterInHg: s.number('Altimeter setting in inches of mercury'),
  },
});

export default Weather;
export { exposedWeather };
