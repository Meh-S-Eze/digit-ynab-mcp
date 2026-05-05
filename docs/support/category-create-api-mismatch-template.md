# YNAB Category Create API Mismatch Template

Use this template when reporting a category-create mismatch to YNAB API support.
Do not include access tokens, raw transaction exports, account IDs, or private budget data.

## Summary

Category creation appears documented and available, but a live create request was rejected with `400 bad_request` even though the `category_group_id` came from a successful `GET /plans/{plan_id}/categories` response immediately before the create request.

## Environment

- Client: YNAB MCP Server
- Runtime package, if relevant: `ynab@<version>`
- Base API URL: `https://api.ynab.com/v1`
- Auth type: Personal Access Token or OAuth

## Preflight Evidence

Endpoint:

```text
GET /plans/<plan_id>/categories
```

Result:

```json
{
  "status": 200,
  "target_group": {
    "id": "<category_group_id>",
    "name": "<category_group_name>",
    "hidden": false,
    "deleted": false
  },
  "target_category_already_exists": false
}
```

## Create Attempt

Endpoint:

```text
POST /plans/<plan_id>/categories
```

Request shape:

```json
{
  "category": {
    "name": "<new_category_name>",
    "category_group_id": "<category_group_id>"
  }
}
```

## API Response

```text
400 bad_request: category_group_id does not exist in this budget
```

## Follow-Up Checks

- Confirmed the category group is not hidden or deleted.
- Confirmed the category did not already exist.
- Confirmed other write APIs work with the same token, if tested.
- Confirmed a fresh token behaves the same way, if tested.

## Question for YNAB API Support

Is `POST /plans/{plan_id}/categories` expected to support creating a category under a category group returned by `GET /plans/{plan_id}/categories` for the same plan?

If yes, is the OpenAPI spec missing a required ID namespace, field, permission, or plan/category-group constraint that would explain this response?
