import { Component, inject, signal } from '@angular/core';
import { Feature } from './Feature';
import { Squircle } from '../Squircle';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { VideoOverlay } from '../VideoOverlay';

type FeatureListItem = {
  title: string;
  description: string;
  videoUrl?: SafeResourceUrl;
  docsPath?: string[];
  preview?: true;
  imageUrl: string;
};

@Component({
  selector: 'www-features',
  imports: [Squircle, Feature, VideoOverlay],
  template: `
    <div
      class="features"
      wwwSquircle="32"
      [wwwSquircleBorderWidth]="1"
      wwwSquircleBorderColor="rgba(173, 144, 124, 0.24)"
    >
      <div class="header">
        <img
          src="/image/landing-page/features/gen-ui-framework.svg"
          alt="Generative UI Framework for Engineers"
        />
        <div class="intro">
          <h2>The Generative UI Framework for Engineers</h2>
          <p>
            Hashbrown gives developers full control over generative AI to build
            user interfaces that are predictable, high quality, and ready to
            ship
          </p>
        </div>
      </div>

      <div class="feature-list">
        @for (feature of featureList; track feature.title) {
          <www-feature
            [title]="feature.title"
            [description]="feature.description"
            [imageUrl]="feature.imageUrl"
            [videoUrl]="feature.videoUrl"
            [docsPath]="feature.docsPath"
            [preview]="feature.preview ?? false"
            (watchDemo)="onWatchDemo($event)"
          />
        }
      </div>
    </div>

    @if (videoUrl()) {
      <www-video-overlay
        [open]="demoVideoOpen()"
        (closed)="demoVideoOpen.set(false)"
      >
        <div
          style="position: relative; padding-bottom: 64.90384615384616%; height: 0;"
          class="video"
        >
          <iframe
            [src]="videoUrl()"
            frameborder="0"
            webkitallowfullscreen
            mozallowfullscreen
            allowfullscreen
            style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"
          ></iframe>
        </div>
      </www-video-overlay>
    }
  `,
  styles: `
    :host {
      width: 100%;
      display: flex;
      justify-content: center;
      padding: 32px 24px;
    }

    .features {
      background-color: white;
      width: 100%;
      max-width: 1200px;
      box-shadow: 0 0 16px 0 rgba(0, 0, 0, 0.1);
      display: flex;
      flex-direction: column;
    }

    .features > .header {
      width: 100%;
      display: flex;
      padding: 40px 24px 56px 24px;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      gap: 16px;
      align-self: stretch;

      .intro {
        width: 100%;
        max-width: 620px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;

        @media screen and (max-width: 768px) {
          max-width: 410px;
        }
      }

      h2 {
        color: var(--gray-dark, #3d3c3a);
        text-align: center;
        font-family: KefirVariable;
        font-size: 26px;
        font-style: normal;
        font-variation-settings: 'wght' 625;
        line-height: 120%; /* 31.2px */
      }

      p {
        color: var(--gray, #5e5c5a);
        text-align: center;
        font-family: Fredoka;
        font-size: 18px;
        font-style: normal;
        font-weight: 500;
        line-height: 140%; /* 25.2px */
        letter-spacing: 0.18px;
      }
    }

    .feature-list {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      border-top: 1px solid rgba(173, 144, 124, 0.24);
    }

    www-feature {
      border-bottom: 1px solid rgba(173, 144, 124, 0.24);
    }

    @media screen and (min-width: 1248px) {
      www-feature:not(:nth-child(3n)) {
        border-right: 1px solid rgba(173, 144, 124, 0.24);
      }

      www-feature:nth-last-child(-n + 3) {
        border-bottom: none;
      }
    }

    @media screen and (max-width: 1248px) and (min-width: 768px) {
      .feature-list {
        grid-template-columns: repeat(2, 1fr);
      }

      www-feature:not(:nth-child(2n)) {
        border-right: 1px solid rgba(173, 144, 124, 0.24);
      }

      www-feature:nth-last-child(-n + 2) {
        border-bottom: none;
      }
    }

    @media screen and (max-width: 768px) {
      .feature-list {
        grid-template-columns: repeat(1, 1fr);
      }
    }

    @media screen and (max-width: 480px) {
      .features > .header {
        padding: 24px;
      }
    }
  `,
})
export class Features {
  sanitizer = inject(DomSanitizer);
  demoVideoOpen = signal(false);
  videoUrl = signal<SafeResourceUrl | null>(null);

  onWatchDemo(videoUrl: SafeResourceUrl) {
    this.demoVideoOpen.set(true);
    this.videoUrl.set(videoUrl);
  }

  featureList: FeatureListItem[] = [
    {
      title: 'Generative User Interfaces',
      description:
        "Expose your React or Angular components and let Hashbrown use an LLM to serve dynamic views. You stay in control of the ingredients, deciding exactly what can and can't be generated.",
      docsPath: ['concept', 'components'],
      imageUrl: '/image/landing-page/features/generative-user-interfaces.svg',
      videoUrl: this.sanitizer.bypassSecurityTrustResourceUrl(
        'https://www.loom.com/embed/00f9bc82287b400f9ac37714262e4955?sid=78eb2d30-e541-412a-981a-428860ce4665',
      ),
    },
    {
      title: 'Tool Calling',
      description:
        'Hashbrown lets you define custom tools the LLM can use to fetch data or perform actions. While other AI SDKs stop at the server, Hashbrown runs tool calling in the browser so developers can expose app services and state directly.',
      docsPath: ['concept', 'functions'],
      imageUrl: '/image/landing-page/features/tool-calling.svg',
    },
    {
      title: 'Structured Data',
      description:
        'Hashbrown comes with Skillet, a schema language that makes it simple to get structured data from LLMs. It is fully type safe and works for component props, structured outputs, and tool definitions, always served just right.',
      docsPath: ['concept', 'schema'],
      imageUrl: '/image/landing-page/features/structured-data.svg',
      videoUrl: this.sanitizer.bypassSecurityTrustResourceUrl(
        'https://www.loom.com/embed/5c15403faa8246aa82ca9d17930336ed?sid=d6b31dcb-cb9a-4ded-832f-112912129973',
      ),
    },
    {
      title: 'Streaming Responses',
      description:
        'Hashbrown uses web standards to stream responses in common JavaScript runtimes like Node.js, Lambda, and Cloudflare Workers. A built-in JSON parser lets your app display results as fast as the LLM generates them.',
      docsPath: ['concept', 'streaming'],
      imageUrl: '/image/landing-page/features/streaming-responses.svg',
    },
    {
      title: 'Vendor Agnostic',
      description:
        'Hashbrown works with the LLM vendor of your choice, with built-in support for OpenAI, Azure, Google Gemini, Writer, and Ollama, with adapters for AWS Bedrock and Anthropic coming to Hashbrown soon.',
      docsPath: ['platform', 'openai'],
      imageUrl: '/image/landing-page/features/vendor-agnostic.svg',
    },
    {
      title: 'JavaScript Runtime',
      description:
        'Hashbrown includes a JavaScript runtime compiled to WebAssembly for executing AI-generated code. Create glue code to build graphs on the fly, stitch services together, ground mathematical operations, and more.',
      docsPath: ['concept', 'runtime'],
      imageUrl: '/image/landing-page/features/javascript-runtime.svg',
      videoUrl: this.sanitizer.bypassSecurityTrustResourceUrl(
        'https://www.loom.com/embed/e820ecdc43634f258dad37f7c8a46194?sid=d739a3d8-d1a2-450f-816b-f4f60bbce365',
      ),
    },
    {
      title: 'Model Context Protocol',
      description:
        'Hashbrown integrates with the MCP Client SDK to call remote tools on an MCP server. This lets you connect your app to shared services, enterprise systems, and custom workflows through a standardized protocol.',
      docsPath: ['recipes', 'remote-mcp'],
      imageUrl: '/image/landing-page/features/mcp.svg',
    },
    {
      title: 'Listen To & Generate Speech',
      preview: true,
      description:
        'Hashbrown pairs speech-to-text and text-to-speech models to make interfaces conversational. Use them together to build voice agents that listen to users, generate speech and UI, and interact with your web app.',
      imageUrl:
        '/image/landing-page/features/listen-to-and-generate-speech.svg',
    },
    {
      title: 'Analyze Images & Documents',
      preview: true,
      description:
        'Scan images and documents with device cameras and turn them into structured data that connects your app to the physical world. Expose files to the JavaScript Runtime to let LLMs generate scripts for deeper analysis.',
      imageUrl: '/image/landing-page/features/analyze-images-and-documents.svg',
    },
  ];
}
