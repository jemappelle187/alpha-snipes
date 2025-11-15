# Birdeye API Endpoints Reference

This document lists the Birdeye API endpoints used in the Alpha Snipes bot integration.

## Base URL
```
https://public-api.birdeye.so
```

## Authentication
All requests require the `X-API-KEY` header:
```
X-API-KEY: your_api_key_here
```

## Endpoints Used

### 1. Wallet Trades (Seek By Time)
**Endpoint:** `GET /v1/wallet/trades_seek_by_time`

**Purpose:** Fetch wallet trades within a time range (for startup backfill and validation)

**Parameters:**
- `address` (required): Wallet address
- `type` (optional): `all`, `buy`, or `sell` (default: `all`)
- `from_time` (optional): Unix timestamp (seconds) - start time
- `to_time` (optional): Unix timestamp (seconds) - end time
- `limit` (optional): Number of results (default: 100, max: 1000)
- `offset` (optional): Pagination offset

**Documentation:** https://docs.birdeye.so/reference/get-wallet-trades-seek-by-time

**Response Format:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "signature": "tx_hash",
        "tokenAddress": "mint_address",
        "type": "buy" | "sell",
        "amount": 123456.789,
        "solAmount": 0.123,
        "usdValue": 12.34,
        "price": 0.000001,
        "timestamp": 1234567890,
        "symbol": "TOKEN",
        "name": "Token Name"
      }
    ]
  }
}
```

---

### 2. Token Overview
**Endpoint:** `GET /v1/token/overview`

**Purpose:** Fetch comprehensive token data (price, liquidity, volume, market cap)

**Parameters:**
- `address` (required): Token mint address

**Documentation:** https://docs.birdeye.so/reference/get-token-overview

**Response Format:**
```json
{
  "success": true,
  "data": {
    "price": 0.000001,
    "priceUsd": 0.00015,
    "liquidity": 1000.5,
    "liquidityUsd": 150000,
    "volume24h": 50000,
    "volume24hUsd": 7500,
    "marketCap": 1000000,
    "priceChange24h": 5.5,
    "symbol": "TOKEN",
    "name": "Token Name"
  }
}
```

---

### 3. Token Price (Alternative)
**Endpoint:** `GET /v1/defi/price`

**Purpose:** Fetch current token price (lighter alternative to overview)

**Parameters:**
- `address` (required): Token mint address

**Documentation:** https://docs.birdeye.so/reference/get-defi-price

**Response Format:**
```json
{
  "success": true,
  "data": {
    "value": 0.000001,
    "updateUnixTime": 1234567890
  }
}
```

**Note:** This endpoint is simpler but provides less data than `/token/overview`. Use `/token/overview` for comprehensive data.

---

## Rate Limits

- **Free Tier:** 1 request/second, 30,000 compute units/month
- **Starter ($99/mo):** 15 requests/second, 3M compute units/month
- **Premium ($199/mo):** 50 requests/second, 10M compute units/month
- **Premium Plus ($250/mo):** 50 requests/second, 15M compute units/month
- **Business ($699/mo):** 100 requests/second, 70M compute units/month

## Compute Unit Costs

- `/defi/price`: 10 CU per request
- `/token/overview`: ~50-100 CU per request (estimated)
- `/wallet/trades_seek_by_time`: ~20-50 CU per request (estimated)

## Notes

1. **Solana vs EVM:** Response schemas differ between Solana and EVM chains. This implementation is optimized for Solana.

2. **Checksum Addresses:** Always use checksum contract addresses on supported chains.

3. **Error Handling:** Responses may be `null` or missing data if the token is unknown or unsupported.

4. **Caching:** Implement caching/throttling to avoid hitting rate limits.

5. **API Key:** Get your API key from https://birdeye.so or check their documentation for API access.

## References

- Birdeye API Documentation: https://docs.birdeye.so
- Pricing: https://bds.birdeye.so/pricing
- Compute Unit Costs: https://docs.birdeye.so/docs/compute-unit-cost
- Rate Limits: https://docs.birdeye.so/docs/per-api-rate-limit

