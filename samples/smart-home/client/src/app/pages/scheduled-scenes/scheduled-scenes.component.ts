import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SmartHomeService } from '../../services/smart-home.service';
import { Scene } from '../../models/scene.model';
import { ScheduledScene, Weekday } from '../../models/scheduled-scene.model';

@Component({
  selector: 'app-scheduled-scenes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container mx-auto p-4">
      <h1 class="text-2xl font-bold mb-4">Scheduled Scenes</h1>

      <!-- Add New Scheduled Scene -->
      <div class="bg-white p-4 rounded-lg shadow mb-6">
        <h2 class="text-xl font-semibold mb-4">Add New Schedule</h2>
        <form (ngSubmit)="addScheduledScene()" class="space-y-4">
          <div>
            <label for="sceneId" class="block text-sm font-medium text-gray-700"
              >Scene</label
            >
            <select
              id="sceneId"
              [(ngModel)]="newScheduledScene.sceneId"
              name="sceneId"
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              required
            >
              <option value="">Select a scene</option>
              @for (scene of scenes(); track scene.id) {
              <option [value]="scene.id">{{ scene.name }}</option>
              }
            </select>
          </div>

          <div>
            <label
              for="startDate"
              class="block text-sm font-medium text-gray-700"
              >Start Date</label
            >
            <input
              id="startDate"
              type="datetime-local"
              [(ngModel)]="newScheduledScene.startDate"
              name="startDate"
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              required
            />
          </div>

          <fieldset>
            <legend class="block text-sm font-medium text-gray-700">
              Recurrence
            </legend>
            <div class="mt-2 space-y-2">
              @for (weekday of weekdays; track weekday) {
              <label [for]="weekday" class="inline-flex items-center">
                <input
                  [id]="weekday"
                  type="checkbox"
                  [checked]="
                    newScheduledScene.recurrenceRule.weekdays.includes(weekday)
                  "
                  (change)="toggleWeekday(weekday)"
                  class="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
                <span class="ml-2">{{ weekday | titlecase }}</span>
              </label>
              }
            </div>
          </fieldset>

          <button
            type="submit"
            class="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Add Schedule
          </button>
        </form>
      </div>

      <!-- List of Scheduled Scenes -->
      <div class="bg-white p-4 rounded-lg shadow">
        <h2 class="text-xl font-semibold mb-4">Active Schedules</h2>
        <div class="space-y-4">
          @for (scheduledScene of scheduledScenes(); track scheduledScene.id) {
          <div class="border rounded-lg p-4">
            <div class="flex justify-between items-start">
              <div>
                <h3 class="font-medium">
                  {{ getSceneName(scheduledScene.sceneId) }}
                </h3>
                <p class="text-sm text-gray-500">
                  Starts: {{ scheduledScene.startDate | date : 'medium' }}
                </p>
                @if (scheduledScene.recurrenceRule?.weekdays?.length) {
                <p class="text-sm text-gray-500">
                  Repeats on:
                  {{
                    scheduledScene.recurrenceRule?.weekdays?.join(', ')
                      | titlecase
                  }}
                </p>
                }
              </div>
              <div class="flex space-x-2">
                <button
                  (click)="toggleEnabled(scheduledScene)"
                  class="text-sm px-2 py-1 rounded"
                  [class.bg-green-100]="scheduledScene.isEnabled"
                  [class.bg-red-100]="!scheduledScene.isEnabled"
                >
                  {{ scheduledScene.isEnabled ? 'Enabled' : 'Disabled' }}
                </button>
                <button
                  (click)="deleteScheduledScene(scheduledScene.id)"
                  class="text-sm text-red-600 hover:text-red-800"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class ScheduledScenesComponent {
  private smartHomeService = inject(SmartHomeService);

  readonly scenes = this.smartHomeService.scenes;
  readonly scheduledScenes = this.smartHomeService.scheduledScenes;

  readonly weekdays: Weekday[] = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ];

  newScheduledScene = {
    sceneId: '',
    startDate: '',
    recurrenceRule: {
      weekdays: [] as Weekday[],
    },
    isEnabled: true,
  };

  addScheduledScene() {
    if (!this.newScheduledScene.sceneId || !this.newScheduledScene.startDate) {
      return;
    }

    this.smartHomeService.addScheduledScene({
      ...this.newScheduledScene,
      startDate: new Date(this.newScheduledScene.startDate),
    });

    // Reset form
    this.newScheduledScene = {
      sceneId: '',
      startDate: '',
      recurrenceRule: {
        weekdays: [],
      },
      isEnabled: true,
    };
  }

  toggleWeekday(weekday: Weekday) {
    const weekdays = this.newScheduledScene.recurrenceRule.weekdays;
    const index = weekdays.indexOf(weekday);

    if (index === -1) {
      weekdays.push(weekday);
    } else {
      weekdays.splice(index, 1);
    }
  }

  toggleEnabled(scheduledScene: ScheduledScene) {
    this.smartHomeService.updateScheduledScene(scheduledScene.id, {
      isEnabled: !scheduledScene.isEnabled,
    });
  }

  deleteScheduledScene(id: string) {
    this.smartHomeService.deleteScheduledScene(id);
  }

  getSceneName(sceneId: string): string {
    const scene = this.scenes().find((scene) => scene.id === sceneId);
    return scene?.name ?? 'Unknown Scene';
  }
}
