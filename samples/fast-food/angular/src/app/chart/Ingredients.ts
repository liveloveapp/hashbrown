import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Ingredient } from '../models/ingredient';

@Injectable({ providedIn: 'root' })
export class Ingredients {
  private readonly http = inject(HttpClient);

  getIngredients(args: {
    ingredientIds?: string[];
    startDate: string;
    endDate: string;
  }) {
    return this.http.get<Ingredient[]>('/api/ingredients', { params: args });
  }
}
