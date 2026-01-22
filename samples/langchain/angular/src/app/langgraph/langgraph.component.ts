import { Component, computed, inject } from '@angular/core';
import {
  createTool,
  RenderMessageComponent,
  uiChatResource,
  uiCompletionResource,
} from '@hashbrownai/angular';
import { prompt, s } from '@hashbrownai/core';
import { type HumanMessage } from '@langchain/langgraph-sdk';
import { ChatComponent } from '../components/chat/chat.component';
import { InfiniteLoaderComponent } from '../components/layout/infinite-loader.component';
import { LanggraphService } from '../services/langgraph.service';
import {
  exposedHeading,
  exposedOrderedList,
  exposedParagraph,
  exposedUnorderedList,
  exposedWeather,
} from '../ui';

@Component({
  imports: [ChatComponent, InfiniteLoaderComponent, RenderMessageComponent],
  template: `
    <section class="ui">
      @if (rendering()) {
        <app-infinite-loader />
      } @else if (renderPlanAgent.value(); as uiMessage) {
        <hb-render-message [message]="uiMessage" />
      }
    </section>
    <section class="chat">
      <app-chat
        [agent]="collaboratePlanAgent"
        [isRunning]="isRunning()"
        (stopped)="onStop()"
        [remoteAgentIsRunning]="
          service.isLoading() || service.isThreadLoading()
        "
        [remoteAgentSteps]="service.steps()"
      />
    </section>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .ui {
      height: 100%;
      flex: 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      padding: 16px;
      overflow: hidden;
    }

    .chat {
      height: 100%;
      display: flex;
      flex-direction: column;
      padding: 16px;
    }

    @media (min-width: 768px) {
      :host {
        flex-direction: row;
      }

      .chat {
        width: 420px;
        flex-shrink: 0;
      }
    }
  `,
})
export class LanggraphComponent {
  protected readonly service = inject(LanggraphService);

  private readonly retrieval = computed(() => {
    if (this.service.isLoading() || this.service.isThreadLoading()) {
      return null;
    }
    return {
      messages: this.service.messages(),
      steps: this.service.steps(),
    };
  });

  readonly updatePlanTool = createTool({
    name: 'update_plan',
    description: "Update the plan with the user's query.",
    schema: s.object('Plan agent input', {
      query: s.string("The user's query to update the plan"),
    }),
    handler: async (input: { query: string }, abortSignal: AbortSignal) => {
      if (abortSignal.aborted) {
        throw new Error('Plan agent request was aborted');
      }

      const message: HumanMessage = {
        type: 'human',
        content: input.query,
      };

      const onAbort = () => this.service.stop();
      abortSignal.addEventListener('abort', onAbort);

      try {
        await this.service.submit({
          messages: [message],
        });
      } finally {
        abortSignal.removeEventListener('abort', onAbort);
      }
    },
  });

  readonly readPlanTool = createTool({
    name: 'read_plan',
    description: 'Read the current state of the plan',
    handler: async () => {
      return this.retrieval();
    },
  });

  readonly collaboratePlanAgent = uiChatResource({
    model: 'gpt-5-chat-latest',
    debugName: 'collaborate-plan-agent',
    system: prompt`
      You are a pilot agent and flight planning expert.

      **Instructions**

      You must first call the "update_plan" tool and provide the agent with the user's query.
      Use the "read_plan" tool to read the current state of the remote agent.
      
      **Examples**

      <user>What is the weather at KBDN?</user>
      <assistant>
        <tool-call>update_plan</tool-call>
      </assistant>
      <assistant>
        <ui>
          <h level="2" text="The current conditions at KBDN" />
          <p text="METAR and TAF details and key weather information" />
        </ui>
      </assistant>
    `,
    tools: [this.updatePlanTool, this.readPlanTool],
    components: [
      exposedHeading,
      exposedParagraph,
      exposedOrderedList,
      exposedUnorderedList,
    ],
  });

  readonly renderPlanAgent = uiCompletionResource({
    model: 'gpt-5.1',
    debugName: 'render-plan-agent',
    input: this.retrieval,
    system: prompt`
      You render the plan user interface using the available components.

      Examples

      <user>What is the weather at KBDN?</user>
      <assistant>
        <ui>
          <Weather icao="KBDN" metar="KBDN 123456 123456 123456" taf="KBDN 123456 123456 123456" ceilingFt=${10000} visibilitySm=${10} summary="Sunny" windDirectionDeg=${270} windSpeedKt=${15} temperatureC=${22} dewpointC=${18} altimeterInHg=${29.92} />
        </ui>
      </assistant>

      The examples above are only for reference. You must not use them in your response.
    `,
    components: [exposedWeather],
  });

  readonly rendering = computed(() => {
    return (
      this.collaboratePlanAgent.isLoading() || this.renderPlanAgent.isLoading()
    );
  });

  readonly isRunning = computed(() => {
    return (
      this.service.isLoading() ||
      this.service.isThreadLoading() ||
      this.collaboratePlanAgent.isLoading()
    );
  });

  protected onStop(): void {
    this.service.stop();
    this.collaboratePlanAgent.stop(true);
  }
}
