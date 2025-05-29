# Developing

Thank you for your interest in contributing to hashbrown.

## Prerequisites

- [Node Version Manager (nvm)](https://github.com/nvm-sh/nvm) installed on your machine.

## Setup

1. **Install the required Node.js version:**

   Use nvm to install and use the correct Node.js version for the project.

   ```sh
   nvm install
   nvm use
   ```

2. **Create the environment configuration:**

   Copy `.env.example` to `.env` and replace placeholder values with your actual API keys. For example:

   ```
   OPENAI_API_KEY=your-key-here
   ```

   You may need separate keys depending on which AI providers you plan to test.

3. **Install dependencies:**

   Navigate to the project root directory and install the necessary dependencies.

   ```sh
   npm install
   ```

## Running the project

1. **Start the backend server:**

   Edit `samples/smart-home/server/src/main.ts` to enable the appropriate AI provider by commenting/uncommenting the relevant lines.

   Run the following command to start the backend server:

   ```sh
   npx nx serve server
   ```

2. **Start the frontend application:**

   Run the following command to start the Angular sample application:

   ```sh
   npx nx serve client
   ```

   Run the following command to start the React sample application:

   ```sh
   npx nx serve client-react
   ```

## Optional Dev Container

Open the project in VSCode / Cursor and install the Dev Container extension.
Then, open the command palette and select `Reopen in Container`.
This will start the development environment inside a container.

## Running Tests

To run the full test suite locally:

```sh
npx nx run-many --target=test --all
```

## Submitting Pull Requests

**Please follow these steps to simplify PR reviews — maintainers will request changes if these aren’t followed.**

- Please rebase your branch against the current main.
- Make sure your development dependencies are up-to-date.
- Please ensure the test suite passes before submitting a PR.
- If you've added new functionality, **please** include tests which validate its behavior.
- Make reference to possible [issues](https://github.com/liveloveapp/hashbrown/issues) on PR comment.

## Submitting bug reports

- Please search through issues to see if a previous issue has already been reported and/or fixed.
- When possible, provide a _small_ reproduction using a StackBlitz project or a GitHub repository.
- Detail the affected browser(s) and operating system(s).

## Submitting new features

- We value the brevity of our API surface. This is taken into consideration when building new features.
- Submit an issue with the prefix `RFC:` with your feature request.
- The feature will be discussed and considered.
- Once the PR is submitted, it will be reviewed and merged upon approval.

## Questions and requests for support

Questions and requests for support should not be opened as issues and should be handled in the following ways:

- The team behind hashbrown provides [enterprise support](https://hashbrown.dev/enterprise). We'd love to learn more about your project and how we can add value to your team.
- Start a new [Q&A discussion](https://github.com/liveloveapp/hashbrown/discussions/categories/q-a) on GitHub.

## <a name="commit"></a> Commit Message Guidelines

We have very precise rules over how our git commit messages can be formatted. This leads to **more
readable messages** that are easy to follow when looking through the **project history**. But also,
we use the git commit messages to **generate the the changelog**.

### Commit Message Format

Each commit message consists of a **header**, a **body** and a **footer**. The header has a special
format that includes a **type**, a **scope** and a **subject**:

```
<type>(<scope>): <subject>
<BLANK LINE>
<body>
<BLANK LINE>
<footer>
```

The **header** is mandatory and the **scope** of the header is optional.

Any line of the commit message cannot be longer than 100 characters! This allows the message to be easier
to read on GitHub as well as in various git tools.

The footer should contain a [closing reference to an issue](https://help.github.com/articles/closing-issues-via-commit-messages/) if any.

Samples:

```
feat(core): improve error handling in json parser
```

```
docs(core): clarify documentation of the `anyOf` function
```

```
refactor(core,angular,react): rename 'prompt' to `system'
```

### Revert

If the commit reverts a previous commit, it should begin with `revert:`, followed by the header of the reverted commit. In the body it should say: `This reverts commit <hash>.`, where the hash is the SHA of the commit being reverted.

### Type

Must be one of the following:

- **build**: Changes that affect the build system or external dependencies (example scopes: gulp, broccoli, npm)
- **ci**: Changes to our CI configuration files and scripts (example scopes: Travis, Circle, BrowserStack, SauceLabs)
- **docs**: Documentation only changes
- **feat**: A new feature
- **fix**: A bug fix
- **perf**: A code change that improves performance
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **style**: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc.)
- **test**: Adding missing tests or correcting existing tests

### Scope

The scope should be the name of the npm package affected as perceived by the person reading the changelog generated from commit messages.
In general, the scope is determined by the package name in the root `/packages` directory.

### Subject

The subject contains a succinct description of the change:

- use the imperative, present tense: "change" not "changed" nor "changes"
- don't capitalize the first letter
- no dot (.) at the end

### Body

Just as in the **subject**, use the imperative, present tense: "change" not "changed" nor "changes".
The body should include the motivation for the change and contrast this with previous behavior.

### Footer

The footer should contain any information about **Breaking Changes** and is also the place to
reference GitHub issues that this commit **Closes**.

**Breaking Changes** should start with the word `BREAKING CHANGE:` with a space or two newlines. The rest of the commit message is then used for this.
