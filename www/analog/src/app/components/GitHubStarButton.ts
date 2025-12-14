import { httpResource } from '@angular/common/http';
import { Component, effect, signal } from '@angular/core';
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
      wwwSquircleBorderColor="var(--chocolate-brown-light, #AD907C)"
    >
      <div class="stars">
        @if (stars() > 0) {
          <div class="count">
            {{ stars() }}
          </div>
        }
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
      width: 144px;
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
  starsResource = httpResource<{ stargazers_count: number }>(
    () => 'https://api.github.com/repos/liveloveapp/hashbrown',
  );

  stars = signal<number>(0);

  constructor() {
    if (typeof localStorage !== 'undefined') {
      const gitHubStarCount = Number(localStorage.getItem('gitHubStarCount'));
      if (!isNaN(gitHubStarCount)) {
        this.stars.set(gitHubStarCount);
      }
    }

    effect(() => {
      const value = this.starsResource.value();
      if (!value) {
        return;
      }
      this.stars.set(value.stargazers_count);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(
          'gitHubStarCount',
          value.stargazers_count.toString(),
        );
      }
    });
  }
}
