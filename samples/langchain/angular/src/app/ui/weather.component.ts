import { Component, computed, input } from '@angular/core';
import { exposeComponent } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import { IconWindBarbComponent } from '../components/icons/icon-wind-barb.component';

type FlightCategory = 'VFR' | 'MVFR' | 'IFR' | 'LIFR';

@Component({
  selector: 'app-weather',
  imports: [IconWindBarbComponent],
  template: `
    <section class="card" [attr.aria-label]="'Weather for ' + icao()">
      <header class="header">
        <div class="ident">
          <span class="label">Airport</span>
          <div class="icaoRow">
            <span class="icao">{{ icao() }}</span>
          </div>
        </div>

        <div class="category">
          <span class="categoryBadge" [class]="category()">
            {{ category() }}
          </span>
          <span class="categoryDescription">
            {{ categoryDescription() }}
          </span>
        </div>
      </header>

      <div class="mainGrid">
        <div class="conditionsColumn">
          <div class="conditionBlock">
            <span class="blockValue">{{ skyLabel() }}</span>
          </div>

          <div class="conditionRow">
            <div class="conditionBlock">
              <span class="blockLabel">Visibility</span>
              <span class="blockValue">{{ visibilitySm().toFixed(0) }} SM</span>
            </div>

            <div class="conditionBlock">
              <span class="blockLabel">Altimeter</span>
              <span class="blockValue">{{ pressureLabel() }}</span>
            </div>
          </div>

          <div class="conditionRow">
            <div class="conditionBlock">
              <span class="blockLabel">Temp / Dew</span>
              <span class="blockValue">{{ tempSpread() }}</span>
            </div>

            <div class="conditionBlock">
              <span class="blockLabel">Ceiling</span>
              <span class="blockValue">
                @if (ceilingFt() === null) {
                  -
                } @else {
                  {{ ceilingFt() }} ft AGL
                }
              </span>
            </div>
          </div>
        </div>

        <div class="windColumn">
          <div class="windCard">
            <div class="windBarbWrapper">
              <app-icon-wind-barb
                class="windBarb"
                [speedKnots]="windBarbProps().speedKnots"
                [directionDegrees]="windBarbProps().directionDegrees"
                [size]="96"
                [color]="'var(--sunset-orange, rgba(232, 140, 77, 1))'"
              />
            </div>
            <div class="windText">
              <span class="windPrimary">{{ windLabel() }}</span>
            </div>
          </div>
        </div>
      </div>

      <footer class="footer">
        <div class="footerBlock">
          <code class="code">{{ metar() }}</code>
        </div>
        @if (taf()) {
          <div class="footerBlock">
            <code class="code">{{ taf() }}</code>
          </div>
        }
      </footer>
    </section>
  `,
  styles: `
    .card {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 16px;
      border-radius: 16px;
      background: #f0f0f0;
      color: var(--gray-dark, rgba(61, 60, 58, 1));
    }

    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }

    .ident {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .label {
      font:
        400 11px / 12px 'JetBrains Mono',
        monospace;
      text-transform: uppercase;
      color: var(--gray);
    }

    .icaoRow {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }

    .icao {
      font:
        700 32px / 36px 'JetBrains Mono',
        monospace;
    }

    .category {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
    }

    .categoryBadge {
      font:
        700 11px / 12px 'JetBrains Mono',
        monospace;
      letter-spacing: 0.16em;
      padding: 4px 8px;
      border-radius: 999px;
      border: 1px solid transparent;
      color: #fff;
    }

    .categoryDescription {
      font:
        400 11px / 12px Fredoka,
        sans-serif;
      color: var(--gray, rgba(94, 92, 90, 1));
    }

    .VFR {
      border-color: rgba(34, 197, 94, 0.7);
      background: #22c55e;
    }

    .MVFR {
      border-color: rgba(56, 189, 248, 0.7);
      background: #38bdf8;
    }

    .IFR {
      border-color: rgba(99, 102, 241, 0.7);
      background: #6366f1;
    }

    .LIFR {
      border-color: rgba(232, 140, 77, 0.9);
      background: var(--sunset-orange, rgba(232, 140, 77, 1));
    }

    .mainGrid {
      display: grid;
      grid-template-columns: minmax(0, 2.1fr) minmax(0, 1.6fr);
      gap: 16px;
    }

    .conditionsColumn {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .conditionRow {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }

    .conditionBlock {
      background: #fff;
      border-radius: 8px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .blockLabel {
      font:
        300 9px / 12px 'JetBrains Mono',
        monospace;
      text-transform: uppercase;
      color: var(--gray-light, rgba(164, 163, 161, 1));
    }

    .blockValue {
      font:
        500 16px / 20px 'JetBrains Mono',
        monospace;
    }

    .windColumn {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .windCard {
      background: #fff;
      border-radius: 8px;
      padding: 16px;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 16px;
    }

    .windBarbWrapper {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .windBarb {
      filter: drop-shadow(0 0 12px rgba(232, 140, 77, 0.4));
    }

    .windText {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }

    .windPrimary {
      font-size: 0.95rem;
      font-weight: 500;
    }

    .windHint {
      font-size: 0.7rem;
      color: var(--gray-light, rgba(164, 163, 161, 1));
    }

    .footer {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .footerBlock {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .code {
      font:
        400 14px / 16px 'JetBrains Mono',
        monospace;
      font-size: 12px;
      padding: 8px;
      border-radius: 8px;
      background: #fff;
    }

    @media (max-width: 768px) {
      .mainGrid {
        grid-template-columns: minmax(0, 1fr);
      }

      .header {
        flex-direction: column;
        align-items: flex-start;
      }

      .category {
        align-items: flex-start;
      }

      .windCard {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class WeatherComponent {
  readonly icao = input.required<string>();
  readonly metar = input.required<string>();
  readonly taf = input<string>('');
  readonly ceilingFt = input<number | null>(null);
  readonly visibilitySm = input.required<number>();
  readonly summary = input<string>('No ceiling reported');
  readonly windDirectionDeg = input<number | null>(null);
  readonly windSpeedKt = input<number | null>(null);
  readonly temperatureC = input<number | null>(null);
  readonly dewpointC = input<number | null>(null);
  readonly altimeterInHg = input<number | null>(null);

  protected readonly category = computed(() =>
    getFlightCategory(this.ceilingFt(), this.visibilitySm()),
  );

  protected readonly categoryDescription = computed(() =>
    getFlightCategoryDescription(this.category()),
  );

  protected readonly windLabel = computed(() => {
    const dir = this.windDirectionDeg();
    const speed = this.windSpeedKt();
    if (dir == null || speed == null) {
      return 'Calm / N/A';
    }
    return `${Math.round(dir).toString().padStart(3, '0')}° @ ${speed} kt`;
  });

  protected readonly hasWind = computed(() => {
    return this.windDirectionDeg() != null && this.windSpeedKt() != null;
  });

  protected readonly windBarbProps = computed(() => ({
    speedKnots: this.windSpeedKt() ?? 0,
    directionDegrees: this.windDirectionDeg() ?? 0,
  }));

  protected readonly tempSpread = computed(() => {
    const temp = this.temperatureC();
    const dew = this.dewpointC();
    if (temp == null || dew == null) {
      return 'N/A';
    }
    return `${temp}° / ${dew}°C`;
  });

  protected readonly pressureLabel = computed(() => {
    const altimeter = this.altimeterInHg();
    return altimeter == null ? 'N/A' : `${altimeter.toFixed(2)} inHg`;
  });

  protected readonly skyLabel = computed(() => {
    const summary = this.summary();
    const ceiling = this.ceilingFt();
    if (summary) {
      return summary;
    }
    return ceiling == null ? 'No ceiling' : `${ceiling} ft ceiling`;
  });
}

export const exposedWeather = exposeComponent(WeatherComponent, {
  name: 'Weather',
  description: 'Show weather information to the user',
  input: {
    icao: s.string('The ICAO code of the airport'),
    metar: s.string('The METAR weather report'),
    taf: s.string('The TAF weather forecast'),
    ceilingFt: s.anyOf([
      s.number('The ceiling height in feet, or null if there is no ceiling'),
      s.nullish(),
    ]),
    visibilitySm: s.number('The visibility in statute miles'),
    summary: s.string('The summary of the weather'),
    windDirectionDeg: s.anyOf([
      s.number('Wind direction in degrees true'),
      s.nullish(),
    ]),
    windSpeedKt: s.anyOf([s.number('Wind speed in knots'), s.nullish()]),
    temperatureC: s.anyOf([s.number('Temperature in Celsius'), s.nullish()]),
    dewpointC: s.anyOf([s.number('Dewpoint in Celsius'), s.nullish()]),
    altimeterInHg: s.anyOf([
      s.number('Altimeter setting in inches of mercury'),
      s.nullish(),
    ]),
  },
});

function getFlightCategory(
  ceilingFt: number | null,
  visibilitySm: number,
): FlightCategory {
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
