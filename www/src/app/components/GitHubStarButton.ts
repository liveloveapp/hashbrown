import { httpResource } from '@angular/common/http';
import { Component } from '@angular/core';
import { StarShine } from '../icons/StarShine';
import { Squircle } from './Squircle';

@Component({
  selector: 'www-github-star-button',
  imports: [StarShine, Squircle],
  template: `
    <a
      href="https://github.com/liveloveapp/hashbrown"
      target="_blank"
      rel="noopener noreferrer"
      wwwSquircle="8"
      [wwwSquircleBorderWidth]="2"
      wwwSquircleBorderColor="rgba(0, 0, 0, 0.12)"
    >
      <div class="stars">
        <div class="count">
          {{ stars.value()?.stargazers_count }}
        </div>
        <www-star-shine />
        <div class="label">on GitHub</div>
      </div>
    </a>
  `,
  styles: `
    a {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      background-color: white;
    }

    .stars {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .count {
      font-family: Fredoka, sans-serif;
      font-size: 16px;
      font-style: normal;
      font-weight: 700;
      line-height: normal;
    }

    .count,
    www-star-shine {
      color: var(--sunshine-yellow-dark);
    }

    .label {
      font-family: Fredoka, sans-serif;
      font-size: 12px;
      font-style: normal;
      font-weight: 500;
      line-height: normal;
      color: var(--gray-dark);
    }
  `,
})
export class GitHubStarButton {
  stars = httpResource<{ stargazers_count: number }>(
    () => 'https://api.github.com/repos/liveloveapp/hashbrown',
  );
}
