import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

const STRATEGY_YAML_DIR = path.join(__dirname, 'data/strategies');

export type StrategyYamlConfig = {
  strategy: string;
  exchanges: Array<{
    exchange: string;
    candles?: Array<{
      id: string;
      trading_pair: string;
      interval?: string;
    }>;
  }>;
  controller: Record<string, unknown>;
};

export function loadStrategyYaml(filename: string): StrategyYamlConfig {
  const filePath = path.join(STRATEGY_YAML_DIR, filename);
  const content = fs.readFileSync(filePath, 'utf-8');

  return yaml.parse(content) as StrategyYamlConfig;
}

export function getAllStrategyYamlFiles(): string[] {
  return fs.readdirSync(STRATEGY_YAML_DIR).filter((f) => f.endsWith('.yaml'));
}
