import * as plotly from "plotly.js-dist-min"
import React, { FC, useEffect, useState } from "react"
import {
  Grid,
  FormControl,
  FormLabel,
  MenuItem,
  Select,
  Typography,
  SelectChangeEvent,
  useTheme,
  Box,
} from "@mui/material"
import { plotlyDarkTemplate } from "./PlotlyDarkMode"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const unique = (array: any[]) => {
  const knownElements = new Map()
  array.forEach((elem) => knownElements.set(elem, true))
  return Array.from(knownElements.keys())
}

type AxisInfo = {
  name: string
  min: number
  max: number
  isLog: boolean
  isCat: boolean
  indices: (string | number)[]
  values: (string | number | null)[]
}

const PADDING_RATIO = 0.05
const plotDomId = "graph-contour"

export const Contour: FC<{
  study: StudyDetail | null
}> = ({ study = null }) => {
  const theme = useTheme()
  const [objectiveId, setObjectiveId] = useState<number>(0)
  const [xParam, setXParam] = useState("")
  const [yParam, setYParam] = useState("")
  const paramNames = study?.union_search_space.map((s) => s.name)

  if (!xParam && paramNames && paramNames.length > 0) {
    setXParam(paramNames[0])
  }
  if (!yParam && paramNames && paramNames.length > 1) {
    setYParam(paramNames[1])
  }

  const handleObjectiveChange = (event: SelectChangeEvent<number>) => {
    setObjectiveId(event.target.value as number)
  }
  const handleXParamChange = (event: SelectChangeEvent<string>) => {
    setXParam(event.target.value as string)
  }
  const handleYParamChange = (event: SelectChangeEvent<string>) => {
    setYParam(event.target.value as string)
  }

  useEffect(() => {
    if (study != null) {
      plotContour(study, objectiveId, xParam, yParam, theme.palette.mode)
    }
  }, [study, objectiveId, xParam, yParam, theme.palette.mode])

  const space: SearchSpace[] = study ? study.union_search_space : []

  return (
    <Grid container direction="row">
      <Grid
        item
        xs={3}
        container
        direction="column"
        sx={{ paddingRight: theme.spacing(2) }}
      >
        <Typography variant="h6" sx={{ margin: "1em 0", fontWeight: 600 }}>
          Contour
        </Typography>
        {study !== null && study.directions.length !== 1 ? (
          <FormControl component="fieldset">
            <FormLabel component="legend">Objective ID:</FormLabel>
            <Select value={objectiveId} onChange={handleObjectiveChange}>
              {study.directions.map((d, i) => (
                <MenuItem value={i} key={i}>
                  {i}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : null}
        {study !== null && space.length > 0 ? (
          <Grid container direction="column" gap={1}>
            <FormControl component="fieldset" fullWidth>
              <FormLabel component="legend">x:</FormLabel>
              <Select value={xParam} onChange={handleXParamChange}>
                {space.map((d, i) => (
                  <MenuItem value={d.name} key={d.name}>
                    {d.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl component="fieldset" fullWidth>
              <FormLabel component="legend">y:</FormLabel>
              <Select value={yParam} onChange={handleYParamChange}>
                {space.map((d, i) => (
                  <MenuItem value={d.name} key={d.name}>
                    {d.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        ) : null}
      </Grid>
      <Grid item xs={9}>
        <Box id={plotDomId} sx={{ height: "450px" }} />
      </Grid>
    </Grid>
  )
}

const isNumerical = (trials: Trial[], paramName: string): boolean => {
  return trials.every((t) => {
    const param = t.params.find((param) => param.name === paramName)
    if (!param) return true
    const val = param.value
    return typeof (Number(val) || val) === "number"
  })
}

const getAxisInfo = (trials: Trial[], paramName: string): AxisInfo => {
  const values = trials.map((trial) => {
    const param = trial.params.find((p) => p.name === paramName)
    return param ? Number(param.value) || param.value : null
  })

  let min: number
  let max: number
  let isLog: boolean
  let isCat: boolean

  if (isNumerical(trials, paramName)) {
    const minValue = Math.min(...(values as number[]))
    const maxValue = Math.max(...(values as number[]))
    const padding = (maxValue - minValue) * PADDING_RATIO
    min = minValue - padding
    max = maxValue + padding
    isLog = false
    isCat = false
  } else {
    const uniqueValues = unique(values)
    const span = uniqueValues.length - (uniqueValues.includes(null) ? 2 : 1)
    const padding = span * PADDING_RATIO
    min = -padding
    max = span + padding
    isLog = false
    isCat = true
  }

  const indices = isNumerical(trials, paramName)
    ? unique((values as (number | null)[]).filter((v) => v !== null)).sort(
        (a, b) => a - b
      )
    : unique((values as (string | null)[]).filter((v) => v !== null)).sort(
        (a, b) =>
          a.toString().toLowerCase() < b.toString().toLowerCase()
            ? -1
            : a.toString().toLowerCase() > b.toString().toLowerCase()
            ? 1
            : 0
      )

  if (indices.length >= 2 && isNumerical(trials, paramName)) {
    indices.unshift(min)
    indices.push(max)
  }

  return {
    name: paramName,
    min,
    max,
    isLog,
    isCat,
    indices,
    values,
  }
}

const filterFunc = (trial: Trial, objectiveId: number): boolean => {
  return (
    trial.state === "Complete" &&
    trial.values !== undefined &&
    trial.values[objectiveId] !== "inf" &&
    trial.values[objectiveId] !== "-inf"
  )
}

const plotContour = (
  study: StudyDetail,
  objectiveId: number,
  xParam: string,
  yParam: string,
  mode: string
) => {
  if (document.getElementById(plotDomId) === null) {
    return
  }

  const trials: Trial[] = study ? study.trials : []
  const filteredTrials = trials.filter((t) => filterFunc(t, objectiveId))

  if (filteredTrials.length === 0) {
    plotly.react(plotDomId, [])
    return
  }

  const xAxis = getAxisInfo(trials, xParam)
  const yAxis = getAxisInfo(trials, yParam)
  const xIndices = xAxis.indices
  const yIndices = yAxis.indices

  const xValues: plotly.Datum[] = []
  const yValues: plotly.Datum[] = []
  const zValues: plotly.Datum[][] = new Array(yIndices.length)
  for (let j = 0; j < yIndices.length; j++) {
    zValues[j] = new Array(xIndices.length).fill(null)
  }

  filteredTrials.forEach((trial, i) => {
    if (xAxis.values[i] && yAxis.values[i] && trial.values) {
      const xValue = xAxis.values[i] as string | number
      const yValue = yAxis.values[i] as string | number
      xValues.push(xValue)
      yValues.push(yValue)
      const xi = xIndices.indexOf(xValue)
      const yi = yIndices.indexOf(yValue)
      const zValue = trial.values[objectiveId]
      zValues[yi][xi] = zValue
    }
  })

  const plotData: Partial<plotly.PlotData>[] = [
    {
      type: "contour",
      x: xIndices,
      y: yIndices,
      z: zValues,
      colorscale: "Blues",
      connectgaps: true,
      hoverinfo: "none",
      line: {
        smoothing: 1.3,
      },
      reversescale: study.directions[objectiveId] !== "minimize",
      // https://github.com/plotly/react-plotly.js/issues/251
      // @ts-ignore
      contours: {
        coloring: "heatmap",
      },
    },
    {
      type: "scatter",
      x: xValues,
      y: yValues,
      marker: { line: { width: 2.0, color: "Grey" }, color: "black" },
      mode: "markers",
      showlegend: false,
    },
  ]

  const layout: Partial<plotly.Layout> = {
    xaxis: {
      title: xParam,
      type: xAxis.isCat ? "category" : undefined,
    },
    yaxis: {
      title: yParam,
      type: yAxis.isCat ? "category" : undefined,
    },
    margin: {
      l: 50,
      t: 0,
      r: 50,
      b: 50,
    },
    template: mode === "dark" ? plotlyDarkTemplate : {},
  }
  plotly.react(plotDomId, plotData, layout)
}
