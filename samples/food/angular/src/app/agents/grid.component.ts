import { Component, computed, effect, input, signal } from '@angular/core';
import {
  createRuntime,
  createRuntimeFunction,
  createToolJavaScript,
  structuredCompletionResource,
} from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import { JsonPipe } from '@angular/common';
import {
  AllCommunityModule,
  ModuleRegistry,
  themeAlpine,
} from 'ag-grid-community';
import { AgGridAngular } from 'ag-grid-angular';
import { AllEnterpriseModule } from 'ag-grid-enterprise';

ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);

@Component({
  selector: 'app-grid',
  imports: [AgGridAngular],
  template: `
    @let colDefs = colDefsGenerator.value()?.colDefs;

    @if (colDefs) {
      @let dataFormatScript = colDefsGenerator.value()?.dataFormatScript;

      @if (dataFormatScript) {
        <code>
          <pre>{{ dataFormatScript }}</pre>
        </code>
      }

      <div class="grid-container">
        <ag-grid-angular
          [rowData]="mappedData()"
          [columnDefs]="colDefs"
          [theme]="theme"
        />
      </div>
    } @else {
      <p>No column definitions found</p>
    }
  `,
  styles: `
    .grid-container {
      height: 500px;
      width: 100%;
    }

    ag-grid-angular {
      height: 500px;
      width: 100%;
    }
  `,
})
export class Grid {
  theme = themeAlpine;
  results = input<any[] | null>([]);
  description = input<string | null>(null);
  query = input<string | null>(null);
  sqlQuery = input<string | null | undefined>(null);
  input = computed(() => {
    const results = this.results();
    const description = this.description();
    const query = this.query();
    const sqlQuery = this.sqlQuery();

    if (!results || !description || !query || !sqlQuery) return null;

    console.log('⭐️ colDefsGenerator input', { results, query, sqlQuery });

    const resultsSnippet = JSON.stringify(results).slice(0, 1500);

    return {
      description,
      query,
      sqlQuery,
      resultsSnippet,
    };
  });
  mappedData = signal<any>(null);
  runtime = createRuntime({
    functions: [
      createRuntimeFunction({
        name: 'readData',
        description: 'Read the data from the results',
        result: s.array(
          'the data',
          s.object('a result list', {
            columns: s.array('the columns', s.string('the column name')),
            values: s.array(
              'the rows',
              s.anyOf([
                s.string('a string value'),
                s.number('a number value'),
                s.boolean('a boolean value'),
                s.nullish(),
              ]),
            ),
          }),
        ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handler: async (): Promise<any> => {
          return await this.results();
        },
      }),
      createRuntimeFunction({
        name: 'saveData',
        description: 'Save the data to the grid',
        args: s.array('array of results', s.object('treat this as any', {})),
        handler: async (data) => {
          this.mappedData.set(data);
        },
      }),
    ],
  });
  colDefsGenerator = structuredCompletionResource({
    model: 'gpt-5',
    input: this.input,
    schema: s.object('the result', {
      dataFormatScript: s.string(`
        A JavaScript program that calls "readData" to get the data, formats it 
        for the grid, and then stores it using "saveData(data)" in the grid.

        Here's the runtime this will be running in:

        ${this.runtime.describe()}
      `),
      colDefs: s.array(
        'the column definitions',
        s.object(
          'the column definition. Default to "nullish" for aggFunc, unless otherwise specified.',
          {
            headerName: s.string('the header name'),
            field: s.string('the field name'),
            rowGroup: s.boolean('whether the column is a row group'),
            aggFunc: s.anyOf([
              s.literal('sum'),
              s.literal('avg'),
              s.literal('min'),
              s.literal('max'),
              s.literal('count'),
              s.literal('first'),
              s.literal('last'),
              s.nullish(),
            ]),
          },
        ),
      ),
    }),
    system: `
      You are a helpful assistant that generates column definitions for a grid.
      The input is a query and the results of the query.
      The column definitions are an array of objects with the following properties:
      - headerName: the header name of the column
      - field: the field name of the column
      - type: the type of the column

      You must also generate a data format script that will be used to format the data for the grid.
    `,
  });

  constructor() {
    effect((cleanup) => {
      console.log(
        '⭐️ colDefsGenerator.value()',
        this.colDefsGenerator.value(),
      );

      const sourceCode = this.colDefsGenerator.value()?.dataFormatScript;

      if (!sourceCode) return;

      const cancelController = new AbortController();

      this.runtime.run(
        sourceCode,
        AbortSignal.any([cancelController.signal, AbortSignal.timeout(10_000)]),
      );

      cleanup(() => {
        cancelController.abort();
      });
    });
  }
}
