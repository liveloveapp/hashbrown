# Sample App

<p class="subtitle">Smart home client built with Angular.</p>

Some of the basic features of the sample app include:

1. Simple Chat
2. Tool Calling
3. UI Chat
4. Text completion
5. Structured output
6. Structured completion

[Check out our smart home sample app on GitHub](https://github.com/liveloveapp/hashbrown/tree/main/samples/smart-home/client)

---

## Clone Repository

<hb-code-example header="terminal">

```bash
git clone https://github.com/liveloveapp/hashbrown.git
```

</hb-code-example>

Then install the dependencies:

<hb-code-example header="terminal">

```bash
cd Hashbrown
npm install
```

</hb-code-example>

Open up the `samples/smart-home/client` directory.

## Starting the Application

You will need to start both the server and the client to run the sample application.

<hb-code-example header="terminal">

```bash
npx nx serve server
npx nx serve client
```

</hb-code-example>

## OpenAI API Key

Our samples are built using OpenAI's models.

1. [Sign up for OpenAI's API](https://openai.com/api/)
2. [Create an organization and API Key](https://platform.openai.com/settings/organization/api-keys)
3. Set the `OPENAI_API_KEY` environment variable in the `.env` file in the root directory.

```
OPENAI_API_KEY=your_openai_api_key
```
