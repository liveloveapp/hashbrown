import { Injectable } from '@angular/core';
import initSqlJs from 'sql.js';

@Injectable({ providedIn: 'root' })
export class FoodDb {
  async loadDb() {
    const sqlPromise = initSqlJs({
      locateFile: () => `/sql-wasm.wasm`,
    });
    const dataPromise = fetch('/usda.sql3').then((res) => res.arrayBuffer());
    const [SQL, buf] = await Promise.all([sqlPromise, dataPromise]);
    const db = new SQL.Database(new Uint8Array(buf));

    return db;
  }
}
