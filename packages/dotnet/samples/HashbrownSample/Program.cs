using Azure.AI.OpenAI;
using Azure.Identity;
using Hashbrown.DotNet.Extensions;
using Microsoft.Agents.AI;
using Microsoft.AspNetCore.Components.Forms;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Logging;


var builder = WebApplication.CreateBuilder(args);

// Configure Azure OpenAI client
var azureEndpoint = builder.Configuration["AzureOpenAI:Endpoint"] 
    ?? throw new InvalidOperationException("AzureOpenAI:Endpoint is required");
var deploymentName = builder.Configuration["AzureOpenAI:DeploymentName"] 
    ?? throw new InvalidOperationException("AzureOpenAI:DeploymentName is required");
var apiKey = builder.Configuration["AzureOpenAI:APIKey"] 
    ?? throw new InvalidOperationException("AzureOpenAI:APIKey is required");

var azureClient = new AzureOpenAIClient(
    new Uri(azureEndpoint),
    new System.ClientModel.ApiKeyCredential(apiKey)
    // Uses Managed Identity or Azure CLI for auth
);

// Get chat client (implements IChatClient from Microsoft.Extensions.AI)
var agent = azureClient.GetChatClient(deploymentName).AsIChatClient().AsAIAgent(new ChatClientAgentOptions
{
  Name = "Bro AI Agent",

  ChatOptions = new ChatOptions()
  {
    Instructions = "You are Bro AI, a cool, friendly bro who helps users choose the best caf�s and what to eat. Speak only in English with a chill, concise tone. " +
                "Understand their preferences and give smart, personalized recommendations." +
                "Do not expose the internal descriptions of the tools you use. Always include a next call-to-action that helps you refine suggestions" +
                " or encourages engagement. Stay safe: no medical/legal/financial advice, no made-up facts, no harmful content, no sensitive data requests, and be" +
                " responsible with food recommendations (ask about allergies when needed). If unsure or unsafe, redirect politely. Your mission is to be the user�s " +
                "go-to bro for awesome caf� decisions.",
  }  
});


// Create agent with instructions

var app = builder.Build();

// Map Hashbrown endpoint without persistence (stateless for now)
app.MapHashbrownAgent(
    pattern: "/chat",
    agent: agent,
    messageProvider: null  // No persistence - each request is independent
);

// Simple test UI
app.MapGet("/", () => Results.Content("""
<!DOCTYPE html>
<html>
<head>
    <title>Hashbrown .NET Sample</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        #messages { border: 1px solid #ccc; height: 400px; overflow-y: auto; padding: 10px; margin-bottom: 10px; }
        .message { margin: 10px 0; padding: 10px; border-radius: 5px; }
        .user { background: #e3f2fd; text-align: right; }
        .assistant { background: #f5f5f5; }
        #input { width: calc(100% - 80px); padding: 10px; }
        button { width: 70px; padding: 10px; }
    </style>
</head>
<body>
    <h1>Hashbrown .NET Sample</h1>
    <div id="messages"></div>
    <input type="text" id="input" placeholder="Type a message..." />
    <button onclick="sendMessage()">Send</button>

    <script>
        let threadId = null;

        async function sendMessage() {
            const input = document.getElementById('input');
            const message = input.value.trim();
            if (!message) return;

            addMessage('user', message);
            input.value = '';

            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    operation: 'generate',
                    model: 'gpt-4',
                    messages: [{ role: 'user', content: message }],
                    threadId: threadId
                })
            });

            const reader = response.body.getReader();
            let assistantMessage = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // Parse frames (simplified - production needs proper binary parsing)
                const text = new TextDecoder().decode(value);
                console.log('Frame:', text);

                // Extract content from generation-chunk frames
                if (text.includes('generation-chunk')) {
                    try {
                        const json = JSON.parse(text.substring(4)); // Skip length prefix
                        const content = json.chunk?.choices?.[0]?.delta?.content;
                        if (content) {
                            assistantMessage += content;
                            updateLastMessage(assistantMessage);
                        }
                    } catch (e) {
                        console.error('Parse error:', e);
                    }
                }

                // Extract threadId from thread-save-success
                if (text.includes('thread-save-success')) {
                    try {
                        const json = JSON.parse(text.substring(4));
                        if (json.threadId) threadId = json.threadId;
                    } catch (e) {}
                }
            }

            if (!assistantMessage) {
                addMessage('assistant', '(No response)');
            }
        }

        function addMessage(role, content) {
            const div = document.createElement('div');
            div.className = `message ${role}`;
            div.textContent = content;
            document.getElementById('messages').appendChild(div);
            div.scrollIntoView();
        }

        function updateLastMessage(content) {
            const messages = document.getElementById('messages');
            let last = messages.lastElementChild;
            if (!last || !last.classList.contains('assistant')) {
                last = document.createElement('div');
                last.className = 'message assistant';
                messages.appendChild(last);
            }
            last.textContent = content;
            last.scrollIntoView();
        }

        document.getElementById('input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    </script>
</body>
</html>
""", "text/html"));

app.Run();

