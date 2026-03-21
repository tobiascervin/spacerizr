workspace "E-Commerce Platform" "An example e-commerce system" {

    model {
        customer = person "Customer" "A user who buys products online"
        admin = person "Admin" "System administrator"

        ecommerce = softwareSystem "E-Commerce System" "The main e-commerce platform" {
            webApp = container "Web Application" "Serves the storefront" "React, TypeScript" {
                productCatalog = component "Product Catalog" "Displays products" "React Component"
                shoppingCart = component "Shopping Cart" "Manages cart state" "React + Redux"
                checkout = component "Checkout Flow" "Handles order placement" "React Component"
            }

            apiServer = container "API Server" "Backend REST API" "Node.js, Express" {
                authController = component "Auth Controller" "Handles authentication" "Express Router"
                orderController = component "Order Controller" "Manages orders" "Express Router"
                productService = component "Product Service" "Product CRUD operations" "Service Layer"
            }

            database = container "Database" "Stores all application data" "PostgreSQL"
            cache = container "Cache" "Session and product cache" "Redis"
        }

        payment = softwareSystem "Payment Gateway" "External payment processing service" "External"
        email = softwareSystem "Email Service" "Sends transactional emails" "External"

        # Relationships
        customer -> ecommerce "Browses and purchases products" "HTTPS"
        admin -> ecommerce "Manages products and orders" "HTTPS"
        ecommerce -> payment "Processes payments" "HTTPS/API"
        ecommerce -> email "Sends order confirmations" "SMTP"

        # Internal relationships
        customer -> webApp "Visits" "HTTPS"
        webApp -> apiServer "Makes API calls to" "JSON/HTTPS"
        apiServer -> database "Reads from and writes to" "SQL"
        apiServer -> cache "Caches data in" "Redis Protocol"
        apiServer -> payment "Submits payments to" "HTTPS"
        apiServer -> email "Sends emails via" "SMTP"

        # Component-level relationships
        productCatalog -> productService "Fetches products from" "REST API"
        shoppingCart -> orderController "Creates orders via" "REST API"
        checkout -> authController "Authenticates via" "REST API"
        orderController -> productService "Validates products with"
    }

}
