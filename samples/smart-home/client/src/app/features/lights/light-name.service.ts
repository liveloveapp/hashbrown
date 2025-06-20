import { computed, inject, Injectable, Signal } from '@angular/core';
import { completionResource } from '@hashbrownai/angular';
import { SmartHomeService } from '../../services/smart-home.service';

@Injectable({
  providedIn: 'root',
})
export class LightNameService {}
