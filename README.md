<h1 align="center">Hashbrown - Build Joyful, AI-Powered User Interfaces</h1>

<p align="center">
  <img src="www/public/image/logo/brand-mark.svg" alt="Hashbrown Logo" width="144px" height="136px"/>
  <br>
  <em>Hashbrown is a framework for building AI-powered user interfaces in Angular
    <br> and React on top of LLMs from OpenAI, Google, and Writer.</em>
  <br>
</p>

<p align="center">
  <a href="https://hashbrown.dev/"><strong>hashbrown.dev</strong></a>
  <br>
</p>

<p align="center">
  <a href="CONTRIBUTING.md">Contributing Guidelines</a>
  ·
  <a href="https://github.com/liveloveapp/hashbrown/issues">Submit an Issue</a>
  ·
  <a href="CODE_OF_CONDUCT.md">Code of Conduct</a>
  <br>
  <br>
</p>

<p align="center">
  <a href="https://www.npmjs.com/@hashbrownai/core">
    <img src="https://img.shields.io/npm/v/@hashbrownai/core.svg?logo=npm&logoColor=fff&label=NPM+package&color=orange" alt="Hashbrown on npm" />
  </a>
</p>

<hr>

## Examples

To see hashbrown in action, bring your own LLM provider API Key and try a bite of hashbrown:

- [Angular example app](https://hashbrown.dev/examples/angular/ui-chat)
- [React example app](https://hashbrown.dev/examples/react/ui-chat)

## Samples

**Want more than a quick bite?**

### Angular Smart Home App

```shell
nvm use
npm install
npx nx serve server && npx nx serve client
```

### React Smart Home App

```shell
nvm use
npm install
npx nx serve server && npx nx serve client-react
```

### Angular Finance App

```shell
nvm use
npm install
npx nx serve finance-angular-client
```

### Angular MCP App

In one shell,

```shell
nvm use
npm install
npx nx-mcp . --sse --port 9921
```

Then, in another:

```shell
nvm use
npx nx serve mcp-angular-client
```

Run the documentation website locally:

```shell
nvm use
npm install
# Build dependencies and run the docs site
npx nx run www:collect-docs && npx nx serve www
# If dependencies are already built
npx nx serve www
```

## Contributing

hashbrown is a community-driven project. Read our [contributing guidelines](./CONTRIBUTING.md) on how to get involved.

## Team

Hashbrown is a community effort built by the following developers:

| Photo                                                                                                                   | Name & Bio                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a href="https://github.com/mikeryandev"><img src="www/public/image/team/mike.png" alt="Mike Ryan" width="128px"/></a>  | **Mike Ryan**<br>Mike Ryan is a Google Developer Expert in web technologies and a co-creator of [NgRx](https://github.com/ngrx/platform). He prefers his hashbrowns smothered, covered, peppered, and capped.                                                                                                                                                                                                     |
| <a href="https://github.com/blove"><img src="www/public/image/team/brian.png" alt="Brian Love" width="128px"/></a>      | **Brian Love**<br>Brian is a Google Developer Expert in web technologies. He has a strong background in enterprise software platforms and cloud infrastructure. Brian has an MBA and BS in Computer Information Systems from the State of New York Polytechnic Institute.                                                                                                                                         |
| <a href="https://github.com/bentaylordev"><img src="www/public/image/team/ben.png" alt="Ben Taylor" width="128px"/></a> | **Ben Taylor**<br>Ben Taylor is a software architect with deep expertise in cloud systems and browser-based data visualizations. He has extensive experience designing scalable architectures, optimizing cloud costs, and delivering impactful solutions.                                                                                                                                                        |
| <a href="https://github.com/c0yote"><img src="www/public/image/team/ug.png" alt="U.G. Wilson" width="128px"/></a>       | **U.G. Wilson**<br>U.G. Wilson currently leads the Digital Innovation engineering team at Barry-Wehmiller where he leverages his diverse engineering and leadership experience to drive digital transformation and product-led Industrial IoT.                                                                                                                                                                    |
| <a href="https://github.com/hb-coding"><img src="www/public/image/team/hayden.png" alt="Hayden" width="128px"/></a>     | **Hayden**<br>Hayden is a versatile Software Engineer with extensive experience across Front End, Back End, and Cloud technologies. He has successfully delivered solutions in a diverse range of industries, including startups, large enterprises, government, and consulting. He is Passionate about tackling complex challenges and loves staying up to date in the dynamic JavaScript ecosystem."experience. |

## Enterprise Support

The team behind hashbrown wants to help you with your project. We offer the following services:

**AI Engineering Sprint**

Get your team up to speed with a one-week AI engineering sprint. Includes a hands-on workshop with hashbrown and collaborative development time with our core team to bring your ideas to life.

**Long Term Support**

Ensure reliable, high-performance deployments with our Long Term Support plan. Includes an ongoing support retainer, SLA-backed issue resolution, and guided upgrades.

**Consulting**

LiveLoveApp provides hands-on engagement with our AI engineers for architecture reviews, custom integrations, proof-of-concept builds, performance tuning, and expert guidance on best practices.

## License

MIT © [LiveLoveApp, LLC](https://liveloveapp.com)
