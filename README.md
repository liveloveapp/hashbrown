# Project Cassini

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

Now, you should have both the backend server and the frontend application running. You can access the application in your browser.
