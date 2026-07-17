/**
 * Docker CLI JSON output shapes.
 *
 * Field names match `docker ps --format '{{json .}}'`, `docker inspect`,
 * `docker images --format '{{json .}}'`, and `docker info --format '{{json .}}'`.
 * Optional fields are marked with `?` for resilience across Docker versions.
 * Every interface has a `[key: string]: unknown` index signature so unknown
 * fields from newer Docker versions pass through without type errors.
 */

/** A row from `docker ps --format '{{json .}}'` */
export interface ContainerPsRow {
  ID: string;
  Image: string;
  Status: string;
  State: string;
  Names: string;
  Ports?: string;
  Labels?: string;
  CreatedAt?: string;
  [key: string]: unknown;
}

/**
 * A single container result from `docker inspect`.
 * Only the fields read by the extension are typed; the rest pass through
 * via the index signature.
 */
export interface ContainerInspect {
  Id: string;
  Name: string;
  State: {
    Status: string;
    Running: boolean;
    ExitCode: number;
    StartedAt?: string;
    FinishedAt?: string;
    Error?: string;
    [key: string]: unknown;
  };
  Config?: {
    Image?: string;
    Cmd?: string[];
    Env?: string[];
    Labels?: Record<string, string>;
    WorkingDir?: string;
    [key: string]: unknown;
  };
  NetworkSettings?: {
    Ports?: Record<string, Array<{ HostIp?: string; HostPort?: string }> | null>;
    [key: string]: unknown;
  };
  Mounts?: Array<{
    Name?: string;
    Source: string;
    Destination: string;
    Mode: string;
    RW: boolean;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

/** A row from `docker images --format '{{json .}}'` */
export interface ImageRow {
  Repository: string;
  Tag: string;
  ID: string;
  CreatedSince: string;
  Size: string;
  [key: string]: unknown;
}

/** Subset of `docker info --format '{{json .}}'` */
export interface DockerInfo {
  Containers?: number;
  ContainersRunning?: number;
  ContainersPaused?: number;
  ContainersStopped?: number;
  Images?: number;
  Driver?: string;
  DockerRootDir?: string;
  OperatingSystem?: string;
  Architecture?: string;
  OSType?: string;
  NCPU?: number;
  MemTotal?: number;
  ServerVersion?: string;
  Swarm?: {
    LocalNodeState: string;
    ControlAvailable?: boolean;
    Nodes?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
