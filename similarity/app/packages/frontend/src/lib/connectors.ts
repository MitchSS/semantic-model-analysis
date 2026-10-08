// #region rayfin:app-owned — copied verbatim by the Rayfin CLI; edit freely.
//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import type {
  ConnectorConfig,
  ConnectorsRuntime,
} from '@microsoft/rayfin-connectors';

import {
  connectorConfig as similaritylakehouseConfig,
  type SimilaritylakehouseSchema,
} from '../../../../rayfin/connectors/similaritylakehouse/schema';
// #endregion rayfin:app-owned

export type AppConnectorsSchema = {
  similaritylakehouse: SimilaritylakehouseSchema;
};

export const connectorConfigs = {
  similaritylakehouse: similaritylakehouseConfig,
} satisfies Record<string, ConnectorConfig>;

export const connectorRuntimes: ConnectorsRuntime = {};
