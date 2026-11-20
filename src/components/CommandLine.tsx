// Placeholder with the agreed interface: the command line (function codes, entities, search).
import { GlobalSearch } from './GlobalSearch';
export interface CommandLineProps { /** Slim version for a workspace pane header. */ compact?: boolean; }
export function CommandLine(_props: CommandLineProps) { return <GlobalSearch />; }
