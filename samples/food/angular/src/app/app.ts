import {
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  model,
  signal,
} from '@angular/core';
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

const TABLES = `
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
`;

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
          [description]="gridDescription()"
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
    'foods with calories over 400 grouped by its food group, with additional nutritional information. Show average calories per food group.',
  );

  strategyAgent = structuredCompletionResource({
    model: 'gpt-5',
    input: this.query,
    schema: s.object('The Result', {
      strategy: s.anyOf([
        s.object('Grid Strategy', {
          type: s.literal('grid'),
          descriptionOfGrid: s.string(
            'A description of the grid to show to the user',
          ),
          descriptionOfSqlQuery: s.string(
            'A description of the SQL query used to get the data for the grid. No examples needed.',
          ),
        }),
        s.object('No Strategy', {
          type: s.literal('no_strategy'),
          description: s.string('A description of why no strategy works'),
        }),
      ]),
    }),
    system: `
      You are a helpful assistant that determines the best strategy to use
      for displaying the results based on a natural language query.

      # Strategies
       - grid: Shows a grid to the user. The grid supports sorting, filtering,
         grouping, pivoting. The grid can aggregate values for groups.

      # Data
      ${TABLES}
    `,
  });
  sqlDescription = computed(() => {
    const strategy = this.strategyAgent.value()?.strategy;
    if (strategy?.type === 'grid') {
      console.log('⭐️ strategy', strategy);
      return strategy.descriptionOfSqlQuery;
    }
    return null;
  });
  gridDescription = computed(() => {
    const strategy = this.strategyAgent.value()?.strategy;
    if (strategy?.type === 'grid') {
      return strategy.descriptionOfGrid;
    }
    return null;
  });

  emptyDataSetAttempts = linkedSignal<number>(() => {
    this.query();

    return 0;
  });
  sqlQueryWithAnyErrors = linkedSignal<{
    query: string | null;
    attemptedSqlQuery?: { query: string } | null;
    error?: unknown;
  } | null>(() => {
    const query = this.sqlDescription();

    if (!query) return null;

    return { query };
  });
  sqlTranslator = structuredCompletionResource({
    model: 'gpt-5',
    input: this.sqlQueryWithAnyErrors,
    schema: s.object('The results of the SQL query', {
      query: s.string('The SQL query'),
    }),
    system: `
      You are a helpful assistant that translates a natural language
      query into a SQL query against a food database.

      # Rules
      - Queries must work against SQLite (ASCII sql)
      - Do not use NOT IN with NULL values
      - Do not use UNION when UNION ALL should have been used
      - Do not use BETWEEN for exclusive ranges
      - Do not use data type mismatch in predicates
      - Do not use improperly quoted identifiers
      - Do not use the incorrect number of arguments for functions
      - Do not use the incorrect data type for casting
      - Do not use the incorrect columns for joins

      # Data
      ${TABLES}
    `,
  });

  results = signal<any[] | null>(null);

  resultsSnippet = computed(() => {
    const results = this.results();

    if (!results) return null;

    const stringified = JSON.stringify(results);
    const slice = stringified.slice(0, 1500);

    console.log('⭐️ resultsSnippet', slice);

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

    effect(() => {
      const isLoading = this.sqlTranslator.isLoading();
      const value = this.sqlTranslator.value();
      const db = this.db();
      const emptyDataSetAttempts = this.emptyDataSetAttempts();

      if (isLoading || !value || !db) return;

      console.log(value);

      try {
        const results = db.exec(value.query);

        if (results.length === 0 && emptyDataSetAttempts < 3) {
          this.emptyDataSetAttempts.set(emptyDataSetAttempts + 1);
          this.sqlQueryWithAnyErrors.set({
            query: this.query(),
            attemptedSqlQuery: value,
            error: 'No results found, query returned an empty result set',
          });
        } else {
          this.results.set(results);
        }
      } catch (error) {
        console.error('⭐️ error', error);

        this.sqlQueryWithAnyErrors.set({
          query: this.query(),
          attemptedSqlQuery: value,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  async loadDb() {
    const dbService = inject(FoodDb);
    const db = await dbService.loadDb();
    this.db.set(db);
  }
}
