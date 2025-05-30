# Sample App

We believe that one of the best ways to learn AI engineering using hashbrown is to check out and build on top of our sample app.
The sample application is a smart home client built with Angular.

Some of the basic features of the sample app include:

- Simple Chat
- Function Calling
- UI Chat
- Text completion
- Structured output
- Structured completion

[Check out our smart home sample app on GitHub](https://github.com/liveloveapp/hashbrown/tree/main/samples/smart-home/client)

---

## Clone Repository

First, clone the repository:

```bash
git clone https://github.com/liveloveapp/hashbrown.git
```

Then install the dependencies:

```bash
cd hashbrown
npm install
```

Open up the `samples/smart-home/client` directory.

## Starting the Application

You will need to start both the server and the client to run the sample application.

```bash
npx nx serve server
npx nx serve client
```

## OpenAI API Key

Our samples are built using OpenAI's models.

1. [Sign up for OpenAI's API](https://openai.com/api/)
2. [Create an organization and API Key](https://platform.openai.com/settings/organization/api-keys)
3. Set the `OPENAI_API_KEY` environment variable in the `.env` file in the root directory.

```
OPENAI_API_KEY=your_openai_api_key
```
