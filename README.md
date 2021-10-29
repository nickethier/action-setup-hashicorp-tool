# setup-hashicorp-tool

This action adds a HashiCorp tool, such as Consul or Waypoint, for use by other actions in a workflow.
It can install any binary found at `releases.hashicorp.com`.

For more information, refer to each product's documentation.

## Usage

```yaml
steps:
  - uses: hashicorp/action-setup-hashicorp-tool@v1
    with:
      product: <product-name>
      version: <semver version spec>
```

### Example: Waypoint

This example assumes an existing Waypoint server is running.

```yaml
env:
  WAYPOINT_SERVER_TOKEN: ${{ secrets.WAYPOINT_SERVER_TOKEN }}
  WAYPOINT_SERVER_ADDR: waypoint.example.com:9701
  WAYPOINT_SERVER_TLS: 1
  WAYPOINT_SERVER_TLS_SKIP_VERIFY: 1

steps:
  - uses: actions/checkout@v2
  - uses: hashicorp/action-setup-hashicorp-tool@v1
    with:
      product: waypoint
      version: '0.6.x'
  - run: waypoint init
  - run: waypoint build
```

## Inputs

| Input     | Description                        | Default | Example  | Required |
| --------- | ---------------------------------- | ------- | -------- | -------- |
| `product` | Name of the product to install     |         | 'consul' | ✔        |
| `version` | The version of product to install  |         | '1.11.x' | ✔        |

## Development

Install the dependencies

```bash
$ npm install
```

Build the typescript and package it for distribution

```bash
$ npm run build && npm run package
```

Run the tests

```bash
$ npm test
...
```