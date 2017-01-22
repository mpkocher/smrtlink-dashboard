import React, {Component} from 'react';
import './App.css';

import {Grid, Navbar, Panel} from 'react-bootstrap';
import { BootstrapTable, TableHeaderColumn } from 'react-bootstrap-table';

import Moment from 'moment';
import { extendMoment } from 'moment-range';

const moment = extendMoment(Moment);


// It's a data format example.
function priceFormatter(cell, row){
  return '<i class="glyphicon glyphicon-usd"></i> ' + cell;
}

function linkFormatter(cell, row) {
  return <a href="http://google.com">Details</a>
}

function checkStatus(response) {
  if (response.status >= 200 && response.status < 300) {
    return response
  } else {
    let error = new Error(response.statusText);
    error.response = response;
    throw error
  }
}

function parseJSON(response) {
  return response.json()
}

let JOBS_URL = "http://localhost:8081/secondary-analysis/job-manager/jobs";
let STATUS_URL = "http://localhost:8081/status";
let ALARMS_URL = "http://localhost:8081/smrt-base/alarms";

// Required args to get CORS to work
let FETCH_ARGS =  {
  headers: {
    "Access-Control-Allow-Credentials": "*",
    "Access-Control-Allow-Origin": "*"
  },
  credentials: false
};

function toJobTypeURL(jobType) {
  return JOBS_URL + "/" + jobType
}

class ServiceJob {
  constructor(jobId, name, jobTypeId, state, createdAt, updatedAt, runTime) {
    this.id = jobId;
    this.name = name;
    this.jobTypeId = jobTypeId;
    this.state = state;
    // datetime objs
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    // Run time in Seconds
    this.runTime = runTime;
  }
}

class JobSummary {
  constructor(numFailed, numSuccessful, numCreated, numRunning) {
    this.numFailed = numFailed;
    this.numSuccessful = numSuccessful;
    this.numCreated = numCreated;
    this.numRunning = numRunning;
    this.total = numRunning + numSuccessful + numCreated + numRunning;
  }
}
class Alarm {
  constructor(id, name, state, updatedAt) {
    this.id = id;
    this.name = name;
    this.state = state;
    this.updatedAt = updatedAt;
  }
}

function filterByState(state) {
  function f(job) {
    return job.state === state;
  }
  return f;
}

function toServiceJobsToSummary(serviceJobs) {
  let numRunning = serviceJobs.filter(filterByState("RUNNING")).length;
  let numCreated = serviceJobs.filter(filterByState("CREATED")).length;
  let numFailed = serviceJobs.filter(filterByState("FAILED")).length;
  let numSuccessful = serviceJobs.filter(filterByState("SUCCESSFUL")).length;
  return new JobSummary(numFailed, numSuccessful, numCreated, numRunning);
}


function toDateTime(x) {
  return moment(x, moment.ISO_8601);
}

/**
 * Convert Raw json data to proper ServiceJob data model
 *
 * @param o
 * @returns {ServiceJob}
 */
function toServiceJob(o) {
  let createdAt = toDateTime(o['createdAt']);
  let updatedAt = toDateTime(o['updatedAt']);

  let runTime = moment.duration(updatedAt.diff(createdAt)).asSeconds();

  return new ServiceJob(o['id'], o['name'], o['jobTypeId'], o['state'], createdAt, updatedAt, runTime)
}

function toServiceJobs(rawJson) {
  return rawJson.map(toServiceJob)
}

function toServiceAlarm(o) {
  return new Alarm(o['alarmId'], o['name'], o['state'], toDateTime(o['updatedAt']))
}

function toServiceAlarms(rawJson) {
  return rawJson.map(toServiceAlarm);
}

class StatusComponent extends Component {

  constructor() {
    super();
    this.state = {statusMessage: "Unknown"};
  }

  componentDidMount() {
    fetch(STATUS_URL,
        FETCH_ARGS)
        .then(checkStatus)
        .then(parseJSON)
        .then( (json) => {
          this.setState({statusMessage: json['message']});
        });
  };

  render () {
    return <div>
      <h3>Status {this.state.statusMessage}</h3>
    </div>
  }
}


class AlarmComponent extends Component {

  constructor() {
    super();
    // List of Alarms
    this.state = {data: []};
  }

  componentDidMount() {
    fetch(ALARMS_URL,
        FETCH_ARGS)
        .then(checkStatus)
        .then(parseJSON)
        .then(toServiceAlarms)
        .then((alarms) => {
          this.setState({data: alarms});
        });
  };

  render() {
    return  <BootstrapTable data={this.state.data} striped={true} hover={true}>
      <TableHeaderColumn dataField="id" isKey={true} dataAlign="center" dataSort={true}>Alarm Id</TableHeaderColumn>
      <TableHeaderColumn dataField="name" dataSort={true}>Name</TableHeaderColumn>
      <TableHeaderColumn dataField="state" dataSort={true}>State</TableHeaderColumn>
      <TableHeaderColumn dataField="updatedAt" >Updated At</TableHeaderColumn>
    </BootstrapTable>
  }

}

class JobSummaryComponent extends Component {
  render() {
    return <div>
      <h3>Job Summary (total {this.props.summary.total})</h3>
      <p># Running {this.props.summary.numRunning}</p>
      <p># Successful {this.props.summary.numSuccessful}</p>
      <p># Failed  {this.props.summary.numFailed}</p>
      <p># Created {this.props.summary.numCreated}</p>
    </div>
  }
}


class JobTableComponent extends Component {
  constructor(){
    super();
    this.state = {
      data: []
    };
  };

  componentDidMount() {
    fetch(toJobTypeURL(this.props.jobType),
        FETCH_ARGS)
        .then(checkStatus)
        .then(parseJSON)
        .then(toServiceJobs)
        .then( (json) => {
          this.setState({data: json});
        });
  };
  render() {
    return <div>
      <JobSummaryComponent summary={toServiceJobsToSummary(this.state.data)} />
      <h3>Most Recently Failed Jobs</h3>
      <BootstrapTable data={this.state.data.filter((j) => j.state === "FAILED").slice(1, 15)} striped={true} hover={true}>
      <TableHeaderColumn dataField="id" isKey={true} dataAlign="center" dataSort={true}>Job Id</TableHeaderColumn>
      <TableHeaderColumn dataField="id" dataFormat={linkFormatter} >Details</TableHeaderColumn>
      <TableHeaderColumn dataField="name" dataSort={true}>Name</TableHeaderColumn>
      <TableHeaderColumn dataField="state" dataFormat={priceFormatter}>State</TableHeaderColumn>
      <TableHeaderColumn dataField="createdAt" >Created At</TableHeaderColumn>
      <TableHeaderColumn dataField="updatedAt" >Updated At</TableHeaderColumn>
      <TableHeaderColumn dataField="runTime" >Run Time (sec)</TableHeaderColumn>
    </BootstrapTable>
    </div>
  }


}


class App extends Component {
  render() {
    return (
        <div>
          <Navbar inverse fixedTop>
            <Grid>
              <Navbar.Header>
                <Navbar.Brand>
                  <a href="/">SMRT Link Diagnostics and Health</a>
                </Navbar.Brand>
                <Navbar.Toggle />
              </Navbar.Header>
            </Grid>
          </Navbar>

          <div className="container">
            <Panel header="Status">
              <StatusComponent />
            </Panel>
            <Panel header="System Alarms">
              <AlarmComponent/>
            </Panel>
            <Panel header="Analysis Jobs" >
              <JobTableComponent jobType="pbsmrtpipe" />
            </Panel>
            <Panel header="Merge DataSet Jobs" >
              <JobTableComponent jobType="merge-datasets" />
            </Panel>
            <Panel header="Import DataSet Jobs" >
              <JobTableComponent jobType="import-dataset" />
            </Panel>
            <Panel header="Fasta Convert Jobs" >
              <JobTableComponent jobType="fasta-to-convert" />
            </Panel>
          </div>
        </div>
    );
  }
}

export default App;