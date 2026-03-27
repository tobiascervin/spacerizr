/**
 * Built-in example architectures for the welcome screen gallery.
 */

export interface Example {
  name: string;
  description: string;
  dsl: string;
}

export const examples: Example[] = [
  {
    name: "E-Commerce Platform",
    description: "Multi-tier system with web app, API, database, and external services",
    dsl: `workspace "E-Commerce Platform" "An online shopping platform" {
  model {
    customer = person "Customer" "Browses and purchases products"
    admin = person "Admin" "Manages products and orders"

    ecommerce = softwareSystem "E-Commerce System" "The main e-commerce platform" {
      webapp = container "Web Application" "Frontend SPA" "React, TypeScript"
      api = container "API Server" "REST API backend" "Node.js, Express"
      db = container "Database" "Stores products, orders, users" "PostgreSQL"
      cache = container "Cache" "Session and product cache" "Redis"
    }

    payment = softwareSystem "Payment Gateway" "External payment processing service" {
      tags "External"
    }

    email = softwareSystem "Email Service" "Sends transactional emails" {
      tags "External"
    }

    customer -> webapp "Browses and purchases products"
    admin -> webapp "Manages products and orders"
    webapp -> api "Makes API calls to" "HTTPS/JSON"
    api -> db "Reads from and writes to" "SQL"
    api -> cache "Caches data in" "TCP"
    api -> payment "Processes payments" "HTTPS"
    api -> email "Sends order confirmations" "SMTP"
  }
}`,
  },
  {
    name: "Microservices",
    description: "Event-driven architecture with API gateway, services, and message bus",
    dsl: `workspace "Microservices Platform" "Event-driven microservices architecture" {
  model {
    user = person "User" "Interacts with the platform via web or mobile"

    platform = softwareSystem "Platform" "The microservices platform" {
      gateway = container "API Gateway" "Routes requests to services" "Kong"
      userService = container "User Service" "Authentication and user management" "Go"
      orderService = container "Order Service" "Order processing and fulfillment" "Java, Spring Boot"
      productService = container "Product Service" "Product catalog and inventory" "Node.js"
      notificationService = container "Notification Service" "Email, SMS, push notifications" "Python"
      messageBus = container "Message Bus" "Async event streaming" "Apache Kafka"
      userDb = container "User DB" "User data store" "PostgreSQL"
      orderDb = container "Order DB" "Order data store" "MongoDB"
      productDb = container "Product DB" "Product catalog store" "Elasticsearch"
    }

    user -> gateway "Sends requests to" "HTTPS"
    gateway -> userService "Routes auth requests" "gRPC"
    gateway -> orderService "Routes order requests" "gRPC"
    gateway -> productService "Routes product queries" "gRPC"
    userService -> userDb "Reads/writes user data" "SQL"
    orderService -> orderDb "Stores orders" "MongoDB Protocol"
    orderService -> messageBus "Publishes order events" "Kafka Protocol"
    productService -> productDb "Queries products" "REST"
    notificationService -> messageBus "Consumes events" "Kafka Protocol"
    productService -> messageBus "Publishes inventory events" "Kafka Protocol"
  }
}`,
  },
  {
    name: "Monolith",
    description: "Classic three-tier application with presentation, business, and data layers",
    dsl: `workspace "Corporate Portal" "Internal company portal" {
  model {
    employee = person "Employee" "Uses the portal daily"
    admin = person "IT Admin" "Manages users and settings"

    portal = softwareSystem "Corporate Portal" "Internal company applications" {
      ui = container "Web UI" "Server-rendered pages" "Django Templates"
      backend = container "Backend" "Business logic and API" "Python, Django"
      database = container "Database" "Relational data store" "PostgreSQL"
    }

    ldap = softwareSystem "Active Directory" "Corporate identity provider" {
      tags "External"
    }

    employee -> ui "Uses daily"
    admin -> ui "Manages settings"
    ui -> backend "Submits forms and fetches data" "HTTP"
    backend -> database "Reads and writes" "SQL"
    backend -> ldap "Authenticates users" "LDAP"
  }
}`,
  },
];
