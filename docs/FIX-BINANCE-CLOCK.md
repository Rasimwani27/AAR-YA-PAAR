# Binance error -1021 (timestamp ahead / behind)

If **Test Binance testnet API** shows:

`Timestamp for this request was 1000ms ahead of the server's time`

Your **PC clock** is slightly wrong. Binance rejects signed API calls when the clock drifts.

## Fix on Windows (recommended)

1. **Settings** -> **Time & language** -> **Date & time**
2. Turn **On**: **Set time automatically**
3. Click **Sync now** (or **Sync now** under additional settings)
4. Retry **Test Binance testnet API**

Optional (Admin cmd):

```cmd
w32tm /resync
```

## App fix (included in latest zip)

The dashboard uses **Binance server time** when signing requests and retries once if -1021 still happens. Updating the project or syncing Windows time both help.
