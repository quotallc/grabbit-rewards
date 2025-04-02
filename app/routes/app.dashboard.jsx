import { useState } from "react";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, Select, Button } from "@shopify/polaris";

// For now, we're simulating a list of products.
export const loader = async () => {
  // Replace this with an actual call to Shopify's Admin API later.
  const products = [
    { label: "Product A", value: "gid://shopify/Product/1" },
    { label: "Product B", value: "gid://shopify/Product/2" },
    { label: "Product C", value: "gid://shopify/Product/3" },
  ];
  return json({ products });
};

export default function Dashboard() {
  const { products } = useLoaderData();
  const [selectedProduct, setSelectedProduct] = useState("");

  return (
    <Page title="Discount Code Generator">
      <Card sectioned>
        <Select
          label="Select Product"
          options={products.map((p) => ({
            label: p.label,
            value: p.value,
          }))}
          onChange={setSelectedProduct}
          value={selectedProduct}
          placeholder="Choose a product"
        />
        <Button
          primary
          disabled={!selectedProduct}
          onClick={() => {
            // Here you will eventually trigger the discount-code generation logic.
            console.log("Generate discount codes for:", selectedProduct);
          }}
          style={{ marginTop: "1rem" }}
        >
          Generate Discount Codes
        </Button>
      </Card>
    </Page>
  );
}