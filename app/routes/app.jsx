import { useLoaderData, useActionData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";
import {
  Page,
  Card,
  Select,
  TextField,
  Text,
  Button,
} from "@shopify/polaris";
import { useState } from "react";
import { gql } from "graphql-request";
import Papa from "papaparse";
import React from 'react';
import {BlockStack} from '@shopify/polaris';

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const productQuery = gql`
    {
      products(first: 50) {
        edges {
          node {
            id
            title
          }
        }
      }
    }
  `;

  const productRes = await admin.graphql(productQuery);
  const productsJson = await productRes.json();

  const products = productsJson.data.products.edges.map((edge) => ({
    label: edge.node.title,
    value: edge.node.id,
  }));

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    products,
  };
};

const unparse = Papa.unparse;

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const productId = formData.get("productId");
  const discountAmountStr = formData.get("discountAmount");
  const discountAmount = parseFloat(discountAmountStr);

  if (isNaN(discountAmount) || discountAmount <= 0) {
    return new Response("Invalid discount amount", { status: 400 });
  }

  const ordersQuery = gql`
    {
      orders(first: 100) {
        edges {
          node {
            customer {
              id
              email
            }
            lineItems(first: 10) {
              edges {
                node {
                  product {
                    id
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const ordersRes = await admin.graphql(ordersQuery);
  const ordersJson = await ordersRes.json();

  const customers = ordersJson.data.orders.edges
    .filter((order) =>
      order.node.lineItems.edges.some(
        (item) => item.node.product?.id === productId
      )
    )
    .map((order) => order.node.customer)
    .filter(Boolean);

  const csvRows = [];

  for (const customer of customers) {
    const code = `GRABBIT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const mutation = gql`
      mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
          codeDiscountNode {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      basicCodeDiscount: {
        title: `Grabbit - ${code}`,
        code,
        startsAt: new Date().toISOString(),
        usageLimit: 1,
        appliesOncePerCustomer: true,
        customerSelection: {
          all: true,
        },
        customerGets: {
          items: { all: true },
          value: {
            discountAmount: {
              amount: discountAmount.toFixed(2),
              appliesOnEachItem: false,
            },
          },
        },
      },
    };

    const res = await admin.graphql(mutation, { variables });
    const resJson = await res.json();

    const errors = resJson.data?.discountCodeBasicCreate?.userErrors;
    if (errors?.length) {
      console.warn(`Error for ${customer.email}:`, errors);
      continue;
    }

    csvRows.push({ email: customer.email, code });
  }

  const csv = unparse(csvRows);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename=grabbit-codes.csv`,
    },
  });
};

export default function App() {
  const { apiKey, products } = useLoaderData();
  const actionData = useActionData();
  const [selectedProduct, setSelectedProduct] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");

  const handleDownload = async () => {
    const formData = new FormData();
    formData.append("productId", selectedProduct);
    formData.append("discountAmount", discountAmount);

    const res = await fetch("/download", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Download error:", res.status, text);
      alert("Error generating CSV. See console for details.");
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "grabbit-discounts.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey} i18n={{}}>
      <Page title="Grabbit Rewards">
        <BlockStack gap="400">
          <Card sectioned>
            <BlockStack gap="400">
              <Select
                label="Choose a product"
                options={products}
                onChange={setSelectedProduct}
                value={selectedProduct}
                placeholder="Select a product"
              />

              <TextField
                label="Enter discount amount ($)"
                type="number"
                value={discountAmount}
                onChange={setDiscountAmount}
                autoComplete="off"
              />
            </BlockStack>
          </Card>

          {selectedProduct && discountAmount && (
            <Button onClick={handleDownload}>Download Discount Codes CSV</Button>
          )}

          {actionData?.success && (
            <Card sectioned>
              <Text variant="headingMd">Generated Discount Codes:</Text>
              <ul>
                {actionData.createdCodes.map((code, i) => (
                  <li key={i}>{code}</li>
                ))}
              </ul>
            </Card>
          )}
        </BlockStack>
      </Page>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};