import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import { z } from "zod";
import axios, { AxiosInstance } from "axios";

// ─── DSers API Client ────────────────────────────────────────────────────────

const DSERS_BASE = "https://open-api.dsers.com";

function createDsersClient(apiKey: string): AxiosInstance {
  return axios.create({
    baseURL: DSERS_BASE,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });
}

async function dsersRequest<T>(
  client: AxiosInstance,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  data?: unknown,
  params?: Record<string, string | number>
): Promise<T> {
  try {
    const res = await client.request<T>({ method, url: path, data, params });
    return res.data;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const msg = (err.response?.data as { message?: string })?.message ?? err.message;
      throw new Error(`DSers API error ${status}: ${msg}`);
    }
    throw err;
  }
}

// ─── MCP Server Setup ─────────────────────────────────────────────────────────

const server = new McpServer({
  name: "dsers-mcp-server",
  version: "1.0.0",
});

// ─── Tool: Search Products ────────────────────────────────────────────────────

server.registerTool(
  "dsers_search_products",
  {
    title: "Search DSers Products",
    description: `Search for products in DSers linked to your Shopify store.
Returns product list with IDs, titles, supplier info and mapping status.

Args:
  - api_key (string): Your DSers API key
  - query (string, optional): Search term (product name, SKU)
  - limit (number, optional): Max results (default 20)

Returns: List of products with id, title, sku, mapped status, supplier url.`,
    inputSchema: z.object({
      api_key: z.string().min(1).describe("DSers API key"),
      query: z.string().optional().describe("Search term"),
      limit: z.number().int().min(1).max(100).default(20).describe("Max results"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ api_key, query, limit }) => {
    const client = createDsersClient(api_key);
    const params: Record<string, string | number> = { limit };
    if (query) params.keyword = query;

    try {
      const data = await dsersRequest<{ data: { list: unknown[] } }>(client, "GET", "/v1/products", undefined, params);
      const products = data?.data?.list ?? [];
      return {
        content: [{ type: "text", text: JSON.stringify({ count: products.length, products }, null, 2) }],
      };
    } catch {
      // Fallback: try alternative endpoint
      const data2 = await dsersRequest<unknown>(client, "GET", "/v2/products", undefined, params);
      return {
        content: [{ type: "text", text: JSON.stringify(data2, null, 2) }],
      };
    }
  }
);

// ─── Tool: Get Product ─────────────────────────────────────────────────────────

server.registerTool(
  "dsers_get_product",
  {
    title: "Get DSers Product",
    description: `Get details of a specific product in DSers including supplier mapping.

Args:
  - api_key (string): Your DSers API key
  - product_id (string): DSers product ID

Returns: Full product detail with variants and supplier mapping.`,
    inputSchema: z.object({
      api_key: z.string().min(1).describe("DSers API key"),
      product_id: z.string().min(1).describe("DSers product ID"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ api_key, product_id }) => {
    const client = createDsersClient(api_key);
    const data = await dsersRequest<unknown>(client, "GET", `/v1/products/${product_id}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── Tool: Map Supplier ────────────────────────────────────────────────────────

server.registerTool(
  "dsers_map_supplier",
  {
    title: "Map Supplier to Product",
    description: `Map a supplier product URL to a DSers/Shopify product.
This is the key tool for connecting AliExpress or CJDropshipping products to your store.

Args:
  - api_key (string): Your DSers API key
  - product_id (string): DSers product ID
  - supplier_url (string): AliExpress or CJDropshipping product URL (must be a direct product page URL)
  - variant_mapping (object, optional): Map variant IDs if needed

Returns: Success confirmation with mapping details.`,
    inputSchema: z.object({
      api_key: z.string().min(1).describe("DSers API key"),
      product_id: z.string().min(1).describe("DSers product ID"),
      supplier_url: z.string().url().describe("Direct supplier product page URL (AliExpress or CJDropshipping)"),
      variant_mapping: z.record(z.string()).optional().describe("Optional: map store variant IDs to supplier variant IDs"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ api_key, product_id, supplier_url, variant_mapping }) => {
    const client = createDsersClient(api_key);
    const payload = {
      supplier_url,
      ...(variant_mapping ? { variant_mapping } : {}),
    };
    const data = await dsersRequest<unknown>(client, "POST", `/v1/products/${product_id}/supplier`, payload);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── Tool: List Orders ─────────────────────────────────────────────────────────

server.registerTool(
  "dsers_list_orders",
  {
    title: "List DSers Orders",
    description: `List orders from DSers with their fulfillment status.

Args:
  - api_key (string): Your DSers API key
  - status (string, optional): Filter by status: pending, awaiting, fulfilled, failed
  - limit (number, optional): Max results (default 20)

Returns: List of orders with fulfillment and supplier info.`,
    inputSchema: z.object({
      api_key: z.string().min(1).describe("DSers API key"),
      status: z.enum(["pending", "awaiting", "fulfilled", "failed"]).optional().describe("Order status filter"),
      limit: z.number().int().min(1).max(50).default(20).describe("Max results"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ api_key, status, limit }) => {
    const client = createDsersClient(api_key);
    const params: Record<string, string | number> = { limit };
    if (status) params.status = status;
    const data = await dsersRequest<unknown>(client, "GET", "/v1/orders", undefined, params);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── Tool: Import Product from AliExpress ─────────────────────────────────────

server.registerTool(
  "dsers_import_product",
  {
    title: "Import Product to DSers",
    description: `Import a product from AliExpress or CJDropshipping into DSers import list.
After import, the product can be pushed to your Shopify store.

Args:
  - api_key (string): Your DSers API key
  - product_url (string): Direct AliExpress or CJDropshipping product page URL
  - store_id (string, optional): Target Shopify store ID in DSers

Returns: Imported product details with DSers product ID.`,
    inputSchema: z.object({
      api_key: z.string().min(1).describe("DSers API key"),
      product_url: z.string().url().describe("Direct product URL from AliExpress or CJDropshipping"),
      store_id: z.string().optional().describe("Target Shopify store ID in DSers"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ api_key, product_url, store_id }) => {
    const client = createDsersClient(api_key);
    const payload: Record<string, string> = { product_url };
    if (store_id) payload.store_id = store_id;
    const data = await dsersRequest<unknown>(client, "POST", "/v1/import", payload);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── Tool: Get Stores ──────────────────────────────────────────────────────────

server.registerTool(
  "dsers_get_stores",
  {
    title: "Get Connected Stores",
    description: `List all Shopify stores connected to this DSers account.
Use this first to get store IDs needed for other operations.

Args:
  - api_key (string): Your DSers API key

Returns: List of connected stores with IDs, names and domains.`,
    inputSchema: z.object({
      api_key: z.string().min(1).describe("DSers API key"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ api_key }) => {
    const client = createDsersClient(api_key);
    const data = await dsersRequest<unknown>(client, "GET", "/v1/stores");
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── Tool: Place Order ─────────────────────────────────────────────────────────

server.registerTool(
  "dsers_place_order",
  {
    title: "Place Order to Supplier",
    description: `Place a pending Shopify order to the mapped supplier via DSers.

Args:
  - api_key (string): Your DSers API key
  - order_id (string): DSers order ID to fulfill

Returns: Fulfillment confirmation with supplier order number.`,
    inputSchema: z.object({
      api_key: z.string().min(1).describe("DSers API key"),
      order_id: z.string().min(1).describe("DSers order ID"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ api_key, order_id }) => {
    const client = createDsersClient(api_key);
    const data = await dsersRequest<unknown>(client, "POST", `/v1/orders/${order_id}/place`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── HTTP Server ───────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", server: "dsers-mcp-server", version: "1.0.0" });
});

app.post("/mcp", async (req: Request, res: Response) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const port = parseInt(process.env.PORT ?? "3000");
app.listen(port, () => {
  console.error(`DSers MCP Server running on port ${port}`);
  console.error(`MCP endpoint: http://localhost:${port}/mcp`);
  console.error(`Health check: http://localhost:${port}/health`);
});
