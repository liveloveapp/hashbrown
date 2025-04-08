import { CommonModule } from '@angular/common';
import { Component, computed, HostListener, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { predictionResource } from '@ngai/hashbrown';
import { z } from 'zod';

interface ShoppingItem {
  id: number;
  name: string;
  completed: boolean;
}

@Component({
  selector: 'app-shopping-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="shopping-list-container">
      <h1>Shopping List</h1>

      <div class="items-container">
        @for (item of items(); track item.id) {
        <div class="item-row" [class.completed]="item.completed">
          <input
            type="checkbox"
            [checked]="item.completed"
            (change)="toggleItemCompletion(item.id)"
          />
          <input
            type="text"
            [(ngModel)]="item.name"
            (keydown.enter)="addNewItem()"
            placeholder="Enter item name"
            autocomplete="off"
          />
          <button (click)="removeItem(item.id)">Remove</button>
        </div>
        }
      </div>

      @let predictedItems = predictions.output()?.items; @if (predictedItems &&
      predictedItems.length > 0) {
      <div class="predictions-container">
        <div class="predictions-header">
          <h3>Suggested Items</h3>
          <div class="tab-to-accept">
            <span class="tab-key">TAB</span>
            <span>to accept all suggestions</span>
          </div>
        </div>
        <div class="predictions-list">
          @for (item of predictedItems; track item) {
          <div class="prediction-item">
            <span>{{ item }}</span>
          </div>
          }
        </div>
      </div>
      }

      <button class="add-button" (click)="addNewItem()">Add Item</button>
    </div>
  `,
  styles: `
    .shopping-list-container {
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }

    .items-container {
      margin: 20px 0;
    }

    .item-row {
      display: flex;
      align-items: center;
      margin-bottom: 10px;
      gap: 10px;
    }

    .item-row input[type="text"] {
      flex-grow: 1;
      padding: 8px;
      border: 1px solid #ccc;
      border-radius: 4px;
    }

    .completed input[type="text"] {
      text-decoration: line-through;
      color: #888;
    }

    button {
      padding: 8px 12px;
      background-color: #f44336;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }

    .add-button {
      background-color: #4CAF50;
      width: 100%;
      padding: 10px;
      margin-top: 10px;
    }

    .predictions-container {
      margin: 20px 0;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 15px;
      background-color: #f9f9f9;
    }

    .predictions-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }

    .predictions-header h3 {
      margin: 0;
      color: #333;
    }

    .tab-to-accept {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #666;
      font-size: 14px;
    }

    .tab-key {
      background-color: #e0e0e0;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: bold;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .predictions-list {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .prediction-item {
      background-color: #e8f5e9;
      border: 1px solid #c8e6c9;
      border-radius: 4px;
      padding: 6px 12px;
      color: #2e7d32;
    }
  `,
})
export class ShoppingListComponent {
  nextId = signal(1);
  items = signal<ShoppingItem[]>([{ id: 0, name: '', completed: false }]);
  itemNames = computed(() => {
    if (this.items().length === 0) {
      return null;
    }

    if (this.items().every((item) => item.completed)) {
      return null;
    }

    if (this.items().every((item) => item.name === '')) {
      return null;
    }

    return this.items()
      .filter((item) => item.name)
      .map((item) => item.name);
  });
  predictions = predictionResource({
    model: 'gpt-4o-mini',
    input: this.itemNames,
    outputSchema: z.object({
      items: z.array(z.string().describe('The name of the item')),
    }),
    description: `
      Predict the next items in the shopping list. The user will provide the
      items they have already added. The output should be an array of strings,
      each representing the name of an item that the user might want to add to
      their shopping list. Do not include any duplicate items. Do not include
      any items that the user has already added. For example, if the user has
      already added "apple" and "banana", do not include "apple" or "banana"
      in the output.
    `,
    examples: [
      {
        input: ['apple', 'banana'],
        output: { items: ['orange', 'pear'] },
      },
      {
        input: ['flour', 'sugar'],
        output: { items: ['milk', 'eggs'] },
      },
      {
        input: ['bread', 'cheese'],
        output: { items: ['milk', 'eggs'] },
      },
    ],
  });

  @HostListener('document:keydown.tab', ['$event'])
  handleTabKey(event: KeyboardEvent) {
    // Prevent default tab behavior
    event.preventDefault();

    // Accept all predictions
    this.acceptAllPredictions();
  }

  // Actions
  addNewItem() {
    this.items.update((currentItems) => [
      ...currentItems,
      { id: this.nextId(), name: '', completed: false },
    ]);

    this.nextId.update((id) => id + 1);
  }

  removeItem(id: number) {
    this.items.update((currentItems) =>
      currentItems.filter((item) => item.id !== id)
    );
  }

  toggleItemCompletion(id: number) {
    this.items.update((currentItems) =>
      currentItems.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    );
  }

  acceptAllPredictions() {
    const predictedItems = this.predictions.output()?.items;

    if (predictedItems && predictedItems.length > 0) {
      const newItems = predictedItems.map((name) => ({
        id: this.nextId() + predictedItems.indexOf(name),
        name,
        completed: false,
      }));

      // Update nextId to account for all new items
      this.nextId.update((id) => id + predictedItems.length);

      // Add all predicted items to the list
      this.items.update((currentItems) => [...currentItems, ...newItems]);
    }
  }
}
