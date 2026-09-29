#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Vault } from "@mycore/core";
import { existsSync } from "node:fs";

const MYCORE_VAULT_PATH = process.env.MYCORE_VAULT_PATH || `${process.env.HOME}/.mycore/vault.mycore`;
const MYCORE_PASSPORT_ID = process.env.MYCORE_PASSPORT_ID;

if (!MYCORE_PASSPORT_ID) {
  console.error("Error: MYCORE_PASSPORT_ID environment variable is required");
  process.exit(1);
}

const passportId = MYCORE_PASSPORT_ID;

let vault: Vault;

async function main() {
  // Check if vault exists
  if (!existsSync(MYCORE_VAULT_PATH)) {
    console.error(`Error: Vault not found at ${MYCORE_VAULT_PATH}`);
    process.exit(1);
  }

  // Unlock vault
  const passphrase = process.env.MYCORE_PASSPHRASE;
  if (!passphrase) {
    console.error("Error: MYCORE_PASSPHRASE environment variable is required");
    process.exit(1);
  }

  try {
    vault = await Vault.open(MYCORE_VAULT_PATH, passphrase);
  } catch (error) {
    console.error(`Error unlocking vault: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  // Validate passport
  if (!vault.validatePassport(passportId)) {
    console.error("Error: Passport is invalid, revoked, or expired");
    vault.close();
    process.exit(1);
  }

  // Create MCP server
  const server = new Server(
    {
      name: "mycore-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "get_profile",
          description: "Get profile information from the vault",
          inputSchema: {
            type: "object",
            properties: {
              key: {
                type: "string",
                description: "Profile key to retrieve",
              },
            },
          },
        },
        {
          name: "search_memory",
          description: "Search memory records in the vault",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query",
              },
              limit: {
                type: "number",
                description: "Maximum number of results",
                default: 20,
              },
            },
            required: ["query"],
          },
        },
        {
          name: "list_events",
          description: "List events from the vault",
          inputSchema: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Maximum number of results",
                default: 50,
              },
            },
          },
        },
        {
          name: "list_people",
          description: "List people from the vault",
          inputSchema: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Maximum number of results",
                default: 50,
              },
            },
          },
        },
        {
          name: "add_memory",
          description: "Add a memory record to the vault (goes to pending queue)",
          inputSchema: {
            type: "object",
            properties: {
              text: {
                type: "string",
                description: "Memory text content",
              },
              tags: {
                type: "array",
                items: { type: "string" },
                description: "Tags for the memory",
              },
              sensitivity: {
                type: "string",
                enum: ["public", "personal", "private"],
                description: "Sensitivity level (secret not allowed via MCP)",
                default: "personal",
              },
            },
            required: ["text"],
          },
        },
        {
          name: "get_context_bundle",
          description: "Get a context bundle with task-relevant information",
          inputSchema: {
            type: "object",
            properties: {
              task: {
                type: "string",
                description: "Task description to retrieve relevant context for",
              },
            },
            required: ["task"],
          },
        },
      ],
    };
  });

  // List available resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const filter = vault.applyPassport({}, passportId);
    
    return {
      resources: [
        {
          uri: "mycore://profile",
          name: "Profile",
          description: "User profile information",
          mimeType: "application/json",
        },
        {
          uri: "mycore://people",
          name: "People",
          description: "List of people in the vault",
          mimeType: "application/json",
        },
        {
          uri: "mycore://events",
          name: "Events",
          description: "List of events in the vault",
          mimeType: "application/json",
        },
        {
          uri: "mycore://memories",
          name: "Memories",
          description: "List of memories in the vault",
          mimeType: "application/json",
        },
      ],
    };
  });

  // Handle resource reads
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    
    try {
      const filter = vault.applyPassport({}, passportId);
      
      switch (uri) {
        case "mycore://profile": {
          const results = vault.list({ ...filter, type: "profile" as const });
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }

        case "mycore://people": {
          const results = vault.list({ ...filter, type: "person" as const, limit: 100 });
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }

        case "mycore://events": {
          const results = vault.list({ ...filter, type: "event" as const, limit: 100 });
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }

        case "mycore://memories": {
          const results = vault.list({ ...filter, type: "memory" as const, limit: 100 });
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown resource: ${uri}`);
      }
    } catch (error) {
      throw new Error(`Error reading resource: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      // Apply passport restrictions to all operations
      const filter = vault.applyPassport({}, passportId);

      switch (name) {
        case "get_profile": {
          const results = vault.list({ ...filter, type: "profile" as const });
          const key = args?.key as string;
          const profile = key 
            ? results.find(r => r.data.key === key)
            : results;
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(profile, null, 2),
              },
            ],
          };
        }

        case "search_memory": {
          const query = args?.query as string;
          const limit = args?.limit as number || 20;
          const results = vault.search(query, { ...filter, type: "memory" as const, limit });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }

        case "list_events": {
          const limit = args?.limit as number || 50;
          const results = vault.list({ ...filter, type: "event" as const, limit });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }

        case "list_people": {
          const limit = args?.limit as number || 50;
          const results = vault.list({ ...filter, type: "person" as const, limit });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }

        case "add_memory": {
          const text = args?.text as string;
          const tags = args?.tags as string[] || [];
          const sensitivity = args?.sensitivity as "public" | "personal" | "private" || "personal";

          // Check if passport allows write access
          const passport = vault.getPassport(passportId);
          if (!passport?.scopes.write) {
            throw new Error("Passport does not allow write access");
          }

          // Add as pending record
          const record = vault.add(
            {
              type: "memory",
              data: { text },
              tags,
              sensitivity,
              status: "pending",
              source: "mcp",
            },
            "mcp"
          );

          return {
            content: [
              {
                type: "text",
                text: `Memory added to pending queue with ID: ${record.id}. User approval required.`,
              },
            ],
          };
        }

        case "get_context_bundle": {
          const task = args?.task as string;
          // Simple implementation: search for relevant memories
          const memories = vault.search(task, { ...filter, type: "memory" as const, limit: 10 });
          const people = vault.list({ ...filter, type: "person" as const, limit: 5 });
          
          const bundle = {
            task,
            memories: memories.map(m => ({ text: m.data.text, tags: m.tags })),
            people: people.map(p => ({ name: p.data.name, relation: p.data.relation })),
          };

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(bundle, null, 2),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Handle shutdown
  process.on("SIGINT", async () => {
    await server.close();
    vault.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
