"use client"

import * as React from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Section, EmptyState } from "./section"
import { ColumnPicker, SearchBox, SortHead, sortRows, useSort } from "./table-tools"
import type { SalesTerritory } from "./world-map"
import { TERRITORY_COLUMNS, TerritoryColumn } from "@/lib/prefs"
import { countryToFlag, territoryName } from "@/lib/territories"
import { fmtMoney, fmtNumber } from "@/lib/format"

type SortKey = "name" | "downloads" | TerritoryColumn

interface Props {
  territories: SalesTerritory[]
  currency: string
  hiddenColumns: TerritoryColumn[]
  onColumns: (hidden: TerritoryColumn[]) => void
  onHide: () => void
}

export function TerritoryTable({ territories, currency, hiddenColumns, onColumns, onHide }: Props) {
  const [query, setQuery] = React.useState("")
  const [showAll, setShowAll] = React.useState(false)
  const sort = useSort<SortKey>("downloads")
  const totalDownloads = territories.reduce((n, t) => n + t.first_time + t.redownloads, 0)
  const cols = (Object.keys(TERRITORY_COLUMNS) as TerritoryColumn[]).filter((c) => !hiddenColumns.includes(c))

  const value = (t: SalesTerritory, k: SortKey): number | string => {
    if (k === "name") return territoryName(t.country_code)
    if (k === "downloads" || k === "share") return t.first_time + t.redownloads
    return t[k]
  }
  const rows = sortRows(
    territories.filter((t) => !query || territoryName(t.country_code).toLowerCase().includes(query.toLowerCase()) || t.country_code.toLowerCase() === query.toLowerCase()),
    (t) => value(t, sort.key),
    sort.dir
  )
  const displayed = showAll || query ? rows : rows.slice(0, 15)

  const cell = (t: SalesTerritory, c: TerritoryColumn) => {
    if (c === "proceeds") return fmtMoney(t.proceeds, currency)
    if (c === "share") return totalDownloads ? `${(((t.first_time + t.redownloads) / totalDownloads) * 100).toFixed(1)}%` : "—"
    return fmtNumber(t[c])
  }

  return (
    <Section
      title="Territories"
      description={`${territories.length} storefronts with sales activity in this range`}
      onHide={onHide}
      actions={
        <>
          <SearchBox value={query} onChange={setQuery} placeholder="Find country" />
          <ColumnPicker columns={TERRITORY_COLUMNS} hidden={hiddenColumns} onChange={onColumns} />
        </>
      }
    >
      {!territories.length ? (
        <EmptyState>No territory data in this range.</EmptyState>
      ) : (
        <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <SortHead label="Country" active={sort.key === "name"} dir={sort.dir} onClick={() => sort.toggle("name", "asc")} />
                  <SortHead label="Downloads" className="text-right" active={sort.key === "downloads"} dir={sort.dir} onClick={() => sort.toggle("downloads")} />
                  {cols.map((c) => (
                    <SortHead key={c} label={TERRITORY_COLUMNS[c]} className="text-right" active={sort.key === c} dir={sort.dir} onClick={() => sort.toggle(c)} />
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayed.map((t, i) => (
                  <TableRow key={t.country_code}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">
                      <span className="mr-2">{countryToFlag(t.country_code)}</span>
                      {territoryName(t.country_code)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNumber(t.first_time + t.redownloads)}</TableCell>
                    {cols.map((c) => (
                      <TableCell key={c} className="text-right tabular-nums">{cell(t, c)}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          {!showAll && !query && rows.length > 15 && (
            <div className="mt-3 flex justify-center">
              <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
                Show all {rows.length}
              </Button>
            </div>
          )}
        </>
      )}
    </Section>
  )
}
