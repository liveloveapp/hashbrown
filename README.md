# Hashbrown AI

## Getting Started

### Prerequisites

- [Node Version Manager (nvm)](https://github.com/nvm-sh/nvm) installed on your machine.

### Setup

1. **Install the required Node.js version:**

   Use nvm to install and use the correct Node.js version for the project.

   ```sh
   nvm install
   nvm use
   ```

2. **Create the environment configuration:**

   Create a file named `environment.ts` in the `samples/smart-home/server/src` directory with the following content:

   ```ts
   export const OPEN_AI_API_KEY = 'SOME_API_KEY';
   ```

3. **Install dependencies:**

   Navigate to the project root directory and install the necessary dependencies.

   ```sh
   npm install
   ```

### Running the Project

1. **Start the backend server:**

   Run the following command to start the backend server:

   ```sh
   npx nx s server
   ```

2. **Start the frontend application:**

   Run the following command to start the frontend application:

   ```sh
   npx nx s client
   ```

   If you want to run the react client, start it using:

   ```sh
   npx nx s client-react
   ```

Now, you should have both the backend server and the frontend application running. You can access the application in your browser.

### Optional Dev Container

Open the project in VSCode / Cursor and install the Dev Container extension.

Then, open the command palette and select `Reopen in Container`.

This will start the development environment inside a container.

```bash
nvm install
nvm use
npm install
```

Run the rest of the commands as described above.
