import { NgComponentOutlet } from '@angular/common';
import { Component, computed, input, Type } from '@angular/core';

import { AllRecipesIcon } from './all-recipes-icon';
import { AquafinaIcon } from './aquafina-icon';
import { ArbysIcon } from './arbys-icon';
import { BakersPlusIcon } from './bakers-plus-icon';
import { BurgerKingIcon } from './burger-king-icon';
import { BurgerKingNewsIcon } from './burger-king-news-icon';
import { BurgerKingOriginIcon } from './burger-king-origin-icon';
import { CalorieKingIcon } from './calorie-king-icon';
import { ChickFilAIcon } from './chick-fil-a-icon';
import { ChipotleIcon } from './chipotle-icon';
import { ChipotleIrIcon } from './chipotle-ir-icon';
import { ChipotleNewsroomIcon } from './chipotle-newsroom-icon';
import { CocaColaIcon } from './coca-cola-icon';
import { CtfassetsIcon } from './ctfassets-icon';
import { DairyQueenIcon } from './dairy-queen-icon';
import { DairyQueenNewsIcon } from './dairy-queen-news-icon';
import { DominosIcon } from './dominos-icon';
import { DominosIrIcon } from './dominos-ir-icon';
import { DrPepperIcon } from './dr-pepper-icon';
import { FastFoodCaloriesIcon } from './fast-food-calories-icon';
import { FastFoodNutritionIcon } from './fast-food-nutrition-icon';
import { FastFoodPostIcon } from './fast-food-post-icon';
import { FatSecretIcon } from './fat-secret-icon';
import { FoodsFatSecretIcon } from './foods-fat-secret-icon';
import { HealthyFastFoodIcon } from './healthy-fast-food-icon';
import { HorizonIcon } from './horizon-icon';
import { JackInTheBoxInvestorsIcon } from './jack-in-the-box-investors-icon';
import { JackInTheBoxLocationsIcon } from './jack-in-the-box-locations-icon';
import { KfcGlobalIcon } from './kfc-global-icon';
import { KfcIcon } from './kfc-icon';
import { KfcLocationsIcon } from './kfc-locations-icon';
import { ManualsPlusIcon } from './manuals-plus-icon';
import { McdonaldsIcon } from './mcdonalds-icon';
import { McdonaldsMenuIcon } from './mcdonalds-menu-icon';
import { McdsMenuIcon } from './mcds-menu-icon';
import { MyFoodDiaryIcon } from './my-food-diary-icon';
import { NutritionChartsIcon } from './nutrition-charts-icon';
import { NutritionixIcon } from './nutritionix-icon';
import { NutritionixMobileIcon } from './nutritionix-mobile-icon';
import { OpenWaterIcon } from './open-water-icon';
import { PepsiIcon } from './pepsi-icon';
import { PepsicoProductFactsIcon } from './pepsico-product-facts-icon';
import { PizzaHutBlogIcon } from './pizza-hut-blog-icon';
import { PizzaHutIcon } from './pizza-hut-icon';
import { PizzaHutLocationsIcon } from './pizza-hut-locations-icon';
import { PopeyesIcon } from './popeyes-icon';
import { PopeyesLoveIcon } from './popeyes-love-icon';
import { PopeyesNewsIcon } from './popeyes-news-icon';
import { PoppiIcon } from './poppi-icon';
import { ScribdIcon } from './scribd-icon';
import { SonicIcon } from './sonic-icon';
import { SubwayIcon } from './subway-icon';
import { SubwayNewsroomIcon } from './subway-newsroom-icon';
import { SubwaySwcmsIcon } from './subway-swcms-icon';
import { TacoBellIcon } from './taco-bell-icon';
import { WebArchiveIcon } from './web-archive-icon';
import { WendysIcon } from './wendys-icon';
import { WendysLocationsIcon } from './wendys-locations-icon';
import { WendysOrderIcon } from './wendys-order-icon';
import { WikimediaUploadIcon } from './wikimedia-upload-icon';

type IconComponent = Type<unknown>;

const ICON_BY_HOST: Record<string, IconComponent> = {
  'fastfoodnutrition.org': FastFoodNutritionIcon,
  'fatsecret.com': FatSecretIcon,
  'mcdonalds.com': McdonaldsIcon,
  'chick-fil-a.com': ChickFilAIcon,
  'foods.fatsecret.com': FoodsFatSecretIcon,
  'arbys.com': ArbysIcon,
  'tacobell.com': TacoBellIcon,
  'calorieking.com': CalorieKingIcon,
  'sonicdrivein.com': SonicIcon,
  'dairyqueen.com': DairyQueenIcon,
  'lovethatchickenfrom.popeyes.com': PopeyesLoveIcon,
  'wendys.com': WendysIcon,
  'locations.jackinthebox.com': JackInTheBoxLocationsIcon,
  'dominos.com': DominosIcon,
  'pizzahut.com': PizzaHutIcon,
  'coca-cola.com': CocaColaIcon,
  'news.popeyes.com': PopeyesNewsIcon,
  'origin.bk.com': BurgerKingOriginIcon,
  'chipotle.com': ChipotleIcon,
  'global.kfc.com': KfcGlobalIcon,
  'subway.com': SubwayIcon,
  'assets.ctfassets.net': CtfassetsIcon,
  'locations.kfc.com': KfcLocationsIcon,
  'pepsicoproductfacts.com': PepsicoProductFactsIcon,
  'locations.pizzahut.com': PizzaHutLocationsIcon,
  'ir.dominos.com': DominosIrIcon,
  'investors.jackinthebox.com': JackInTheBoxInvestorsIcon,
  'm.nutritionix.com': NutritionixMobileIcon,
  'bk.com': BurgerKingIcon,
  'news.bk.com': BurgerKingNewsIcon,
  'newsroom.chipotle.com': ChipotleNewsroomIcon,
  'drinkpoppi.com': PoppiIcon,
  'horizon.com': HorizonIcon,
  'kfc.com': KfcIcon,
  'nutritionix.com': NutritionixIcon,
  'pepsi.com': PepsiIcon,
  'fastfoodcalories.com': FastFoodCaloriesIcon,
  'mcdonalds-menu.org': McdonaldsMenuIcon,
  'scribd.com': ScribdIcon,
  'newsroom.subway.com': SubwayNewsroomIcon,
  'manuals.plus': ManualsPlusIcon,
  'allrecipes.com': AllRecipesIcon,
  'upload.wikimedia.org': WikimediaUploadIcon,
  'ir.chipotle.com': ChipotleIrIcon,
  'drinkopenwater.com': OpenWaterIcon,
  'bakersplus.com': BakersPlusIcon,
  'news.dairyqueen.com': DairyQueenNewsIcon,
  'healthyfastfood.org': HealthyFastFoodIcon,
  'fastfoodpost.com': FastFoodPostIcon,
  'aquafina.com': AquafinaIcon,
  'drpepper.com': DrPepperIcon,
  'mcds-menu.com': McdsMenuIcon,
  'nutrition-charts.com': NutritionChartsIcon,
  'blog.pizzahut.com': PizzaHutBlogIcon,
  'myfooddiary.com': MyFoodDiaryIcon,
  'popeyes.com': PopeyesIcon,
  'swcms-w.subway.com': SubwaySwcmsIcon,
  'web.archive.org': WebArchiveIcon,
  'order.wendys.com': WendysOrderIcon,
  'locations.wendys.com': WendysLocationsIcon,
};

@Component({
  selector: 'app-citation-icon',
  standalone: true,
  imports: [NgComponentOutlet],
  template: `
    @if (iconComponent(); as componentType) {
      <span class="icon-wrapper">
        <ng-container *ngComponentOutlet="componentType"></ng-container>
      </span>
    }
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        opacity: 1;
        transition: opacity 0.3s ease;

        @starting-style {
          opacity: 0;
        }
      }

      .icon-wrapper {
        display: inline-flex;
        position: relative;
        top: -2px;
        margin-left: 0px;
        text-decoration: none;
      }
    `,
  ],
})
export class CitationIcon {
  readonly url = input.required<string>();

  protected readonly iconComponent = computed<IconComponent | null>(() => {
    try {
      const url = new URL(this.url());
      const host = url.hostname.toLowerCase();
      const normalized = host.startsWith('www.') ? host.slice(4) : host;
      return ICON_BY_HOST[normalized] ?? ICON_BY_HOST[host] ?? null;
    } catch {
      return null;
    }
  });
}
