import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({
  path: path.resolve(__dirname, '../../.env.testnet'),
});

process.env.MR_MARKET_SYSTEM_TEST_SANDBOX_EXCHANGE = 'true';
