import { Component, computed, inject, model, signal } from '@angular/core';
import {
  completionResource,
  structuredCompletionResource,
} from '@hashbrownai/angular';
import { JsonPipe } from '@angular/common';
import { Database } from 'sql.js';
import { FoodDb } from './food-db';
import { s } from '@hashbrownai/core';
import { FormsModule } from '@angular/forms';
import { Grid } from './agents/grid.component';

@Component({
  imports: [JsonPipe, FormsModule, Grid],
  selector: 'app-root',
  template: `
    <h1>Welcome food-angular</h1>
    <input type="text" [(ngModel)]="query" />
    <h3>View type: {{ viewRouter.value()?.view }}</h3>

    @switch (viewRouter.value()?.view) {
      @case ('GRID') {
        <app-grid
          [results]="results()"
          [query]="query()"
          [sqlQuery]="sqlTranslator.value()?.query"
        />
      }
      @default {
        <h3>Type: {{ viewRouter.value()?.view }}</h3>
      }
    }
  `,
  styles: ``,
})
export class App {
  db = signal<Database | null>(null);
  query = model<null | string>(
    'foods with calories over 400 grouped by its food group, with additional nutritional information',
  );
  sqlTranslator = structuredCompletionResource({
    model: 'gpt-5',
    input: this.query,
    schema: s.object('The results of the SQL query', {
      query: s.string('The SQL query'),
    }),
    system: `
      You are a helpful assistant that translates a natural language
      query into a SQL query against a food database.

      # Rules
      - Queries must work against SQLite (ASCII sql)

      # Tables
      TABLE "food" (
        id int PRIMARY KEY NOT NULL,
        food_group_id int REFERENCES food_group(id) NOT NULL,
        long_desc text NOT NULL DEFAULT '',
        short_desc text NOT NULL DEFAULT '',
        common_names text NOT NULL DEFAULT '',
        manufac_name text NOT NULL DEFAULT '',
        survey text NOT NULL DEFAULT '',
        ref_desc text NOT NULL DEFAULT '',
        refuse int NOT NULL,
        sci_name text NOT NULL DEFAULT '',
        nitrogen_factor float NOT NULL,
        protein_factor float NOT  NULL,
        fat_factor float NOT NULL,
        calorie_factor float NOT NULL
      );

      TABLE "food_group" (
        id int PRIMARY KEY NOT NULL,
        name text NOT NULL
      );

      TABLE "nutrient" (
        id int PRIMARY KEY NOT NULL,
        units text NOT NULL,
        tagname text NOT NULL DEFAULT '',
        name text NOT NULL,
        num_decimal_places text NOT NULL,
        sr_order int NOT NULL
      );

      TABLE "nutrition" (
        food_id int REFERENCES food(id) NOT NULL,
        nutrient_id int REFERENCES nutrient(id) NOT NULL,
        amount float NOT NULL,
        num_data_points int NOT NULL,
        std_error float,
        source_code text NOT NULL,
        derivation_code text,
        reference_food_id REFERENCES food(id),
        added_nutrient text,
        num_studients int,
        min float,
        max float,
        degrees_freedom int,
        lower_error_bound float,
        upper_error_bound float,
        comments text,
        modification_date text,
        confidence_code text,
        PRIMARY KEY(food_id, nutrient_id)
      );

      TABLE "weight (
          food_id int REFERENCES food(id) NOT NULL,
          sequence_num int NOT NULL,
          amount float NOT NULL,
          description text NOT NULL,
          gm_weight float NOT NULL,
          num_data_pts int,
          std_dev float,
          PRIMARY KEY(food_id, sequence_num)
      );
    `,
  });

  results = computed(() => {
    const isLoading = this.sqlTranslator.isLoading();
    const value = this.sqlTranslator.value();
    const db = this.db();

    if (isLoading || !value || !db) return null;

    console.log(value);

    const results = db.exec(value.query);

    return results;
  });

  resultsSnippet = computed(() => {
    const results = this.results();

    if (!results) return null;

    const stringified = JSON.stringify(results);
    const slice = stringified.slice(0, 1500);

    console.log(slice);

    return {
      originalQuery: this.query(),
      snippet: slice,
    };
  });

  viewRouter = structuredCompletionResource({
    model: 'gpt-5',
    input: this.resultsSnippet,
    system: `
      You are being given a snippet of data. Your task is to
      determine which kind of visualization to show for this
      data.

      # Rules
      - If the data is empty, return 'EMPTY_DATA'.
      - If there are 20 or fewer rows, and a numerical comparison, return 'LINE_CHART' or 'BAR_CHART'.
      - If there are more than 20 rows, always return 'GRID'.
    `,
    schema: s.object('The view to render', {
      view: s.enumeration('the visualization type', [
        'LINE_CHART',
        'GRID',
        'PIE_CHART',
        'BAR_CHART',
        'EMPTY_DATA',
      ]),
    }),
  });

  constructor() {
    this.loadDb();
  }

  async loadDb() {
    const dbService = inject(FoodDb);
    const db = await dbService.loadDb();
    this.db.set(db);
  }
}
