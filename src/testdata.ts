import { C4Model } from "./types";

/**
 * Example model: a simple e-commerce system
 */
export const testModel: C4Model = {
  name: "E-Commerce Platform",
  description: "An example C4 model for testing Spacerizr",
  elements: [
    {
      id: "user",
      name: "Customer",
      description: "A customer browsing and buying products",
      type: "person",
      color: "#08427b",
    },
    {
      id: "admin",
      name: "Admin",
      description: "Internal administrator managing products and orders",
      type: "person",
      color: "#08427b",
    },
    {
      id: "ecommerce",
      name: "E-Commerce System",
      description: "The main e-commerce platform",
      type: "softwareSystem",
      color: "#1168bd",
      children: [
        {
          id: "webapp",
          name: "Web Application",
          description: "Serves the storefront to customers",
          type: "container",
          technology: "React, TypeScript",
          color: "#438dd5",
          children: [
            {
              id: "productlist",
              name: "Product List",
              description: "Displays products with search and filters",
              type: "component",
              technology: "React Component",
              color: "#85bbf0",
            },
            {
              id: "cart",
              name: "Shopping Cart",
              description: "Manages items in cart and checkout flow",
              type: "component",
              technology: "React Component",
              color: "#85bbf0",
            },
            {
              id: "auth",
              name: "Auth Module",
              description: "Handles login, registration, sessions",
              type: "component",
              technology: "React Component",
              color: "#85bbf0",
            },
          ],
        },
        {
          id: "api",
          name: "API Server",
          description: "Backend REST API",
          type: "container",
          technology: "Node.js, Express",
          color: "#438dd5",
          children: [
            {
              id: "productapi",
              name: "Product API",
              description: "CRUD operations for products",
              type: "component",
              technology: "Express Router",
              color: "#85bbf0",
            },
            {
              id: "orderapi",
              name: "Order API",
              description: "Order processing and management",
              type: "component",
              technology: "Express Router",
              color: "#85bbf0",
            },
            {
              id: "authapi",
              name: "Auth API",
              description: "Authentication and authorization",
              type: "component",
              technology: "Express Router",
              color: "#85bbf0",
            },
          ],
        },
        {
          id: "db",
          name: "Database",
          description: "Stores products, orders, and user data",
          type: "container",
          technology: "PostgreSQL",
          color: "#438dd5",
        },
        {
          id: "cache",
          name: "Cache",
          description: "Session and product cache",
          type: "container",
          technology: "Redis",
          color: "#438dd5",
        },
      ],
    },
    {
      id: "payment",
      name: "Payment Gateway",
      description: "External payment processing service",
      type: "softwareSystem",
      color: "#999999",
    },
    {
      id: "email",
      name: "Email Service",
      description: "Sends transactional emails",
      type: "softwareSystem",
      color: "#999999",
    },
  ],
  relationships: [
    // System context level
    {
      sourceId: "user",
      destinationId: "ecommerce",
      description: "Browses and purchases products",
      technology: "HTTPS",
    },
    {
      sourceId: "admin",
      destinationId: "ecommerce",
      description: "Manages products and orders",
      technology: "HTTPS",
    },
    {
      sourceId: "ecommerce",
      destinationId: "payment",
      description: "Processes payments",
      technology: "REST API",
    },
    {
      sourceId: "ecommerce",
      destinationId: "email",
      description: "Sends order confirmations",
      technology: "SMTP",
    },
    // Container level
    {
      sourceId: "user",
      destinationId: "webapp",
      description: "Visits",
      technology: "HTTPS",
    },
    {
      sourceId: "admin",
      destinationId: "webapp",
      description: "Manages via",
      technology: "HTTPS",
    },
    {
      sourceId: "webapp",
      destinationId: "api",
      description: "Makes API calls to",
      technology: "JSON/HTTPS",
    },
    {
      sourceId: "api",
      destinationId: "db",
      description: "Reads from and writes to",
      technology: "SQL/TCP",
    },
    {
      sourceId: "api",
      destinationId: "cache",
      description: "Caches data in",
      technology: "Redis protocol",
    },
    {
      sourceId: "api",
      destinationId: "payment",
      description: "Processes payments via",
      technology: "REST API",
    },
    {
      sourceId: "api",
      destinationId: "email",
      description: "Sends emails via",
      technology: "SMTP",
    },
    // Component level (webapp)
    {
      sourceId: "productlist",
      destinationId: "productapi",
      description: "Fetches products from",
    },
    {
      sourceId: "cart",
      destinationId: "orderapi",
      description: "Submits orders to",
    },
    {
      sourceId: "auth",
      destinationId: "authapi",
      description: "Authenticates via",
    },
    // Component level (api)
    {
      sourceId: "productapi",
      destinationId: "db",
      description: "Queries",
    },
    {
      sourceId: "orderapi",
      destinationId: "db",
      description: "Reads/writes orders",
    },
    {
      sourceId: "orderapi",
      destinationId: "payment",
      description: "Charges via",
    },
    {
      sourceId: "authapi",
      destinationId: "db",
      description: "Validates credentials",
    },
    {
      sourceId: "authapi",
      destinationId: "cache",
      description: "Stores sessions in",
    },
  ],
};
