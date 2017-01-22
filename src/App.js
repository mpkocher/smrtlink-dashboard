import React, {Component} from 'react';
import './App.css';

// Running into problems with fetch and Cors. Using jQuery
import jQuery from 'jquery';

// Bootstrap related components
import {Grid, Navbar, Panel} from 'react-bootstrap';
import { BootstrapTable, TableHeaderColumn } from 'react-bootstrap-table';

// Datetime utils
import Moment from 'moment';
import { extendMoment } from 'moment-range';

const moment = extendMoment(Moment);


/**
 * Core Models
 */
class SmrtServerStatus {
  constructor(idx, uuid, version, uptime, status, message) {
    this.idx = idx;
    this.uuid = uuid;
    this.version = version;
    this.uptime = uptime;
    this.status = status;
    this.message = message;
  }
}

class ServiceJob {
  constructor(jobId, name, jobTypeId, state, createdAt, updatedAt, runTime, smrtLinkVersion, createdBy) {
    this.id = jobId;
    this.name = name;
    this.jobTypeId = jobTypeId;
    this.state = state;
    // datetime objs
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    // Run time in Seconds
    this.runTime = runTime;
    // Option[String]
    this.smrtLinkVersion = smrtLinkVersion;
    // Option[String]
    this.createdBy = createdBy
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

/**
 * Convert Raw json data to proper ServiceJob data model
 *
 * @param o
 * @returns {ServiceJob}
 */
function toServiceJob(o) {
  let createdAt = toDateTime(o['createdAt']);
  let updatedAt = toDateTime(o['updatedAt']);

  let createdBy = o['createdBy'];

  let runTime = moment.duration(updatedAt.diff(createdAt)).asSeconds();

  let smrtLinkVersion = (o['smrtlinkVersion'] === null) ? "UNKNOWN" : o['smrtlinkVersion'];

  return new ServiceJob(o['id'], o['name'], o['jobTypeId'], o['state'], createdAt, updatedAt, runTime, smrtLinkVersion, createdBy)
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

/*
 Make a remote call and return the a Promise
 */
const getJson = function(url) {
  // This will return a Promise
  return jQuery.ajax({
    type: 'GET',
    url: url,
    dataType: 'json',
    headers: {'Content-Type':'application/json'}
  });
};


class SmrtLinkClient {
  constructor(host, port) {
    this.host = host;
    this.port = port;
    this.baseUrl = `http://${host}:${port}`;
  }

  toUrl(segment) {
    return `${this.baseUrl}/${segment}`;
  }

  toJobUrl(jobId) {
    return `secondary-analysis/job-manager/jobs/${jobId}`;
  }
  
  fetchJson(segment) {
    return getJson(this.toUrl(segment));
  }

  getStatus() {
    return this.fetchJson('status').then((datum) => {
      return new SmrtServerStatus(datum.id, datum.uuid, datum.version, datum.uptime, datum.status, datum.message)
    })
  }

  getJobsByType(jobType) {
    return this.fetchJson(`secondary-analysis/job-manager/jobs/${jobType}`).then(toServiceJobs)
  }

  getAlarms() {
    return this.fetchJson(`smrt-base/alarms`).then(toServiceAlarms)
  }

}

function linkFormatter(cell, row) {
  let jobId = row['id'];
  let url = `http://google.com/${jobId}`;
  return <a href={url}>`${jobId}`</a>
}

function jobDetailLinkFormatter(cell, row) {
  return <a href="http://google.com">Details</a>
}

function jobNameFormatter(cell, row) {
  let maxName = 25;
  // If the name is too long, then truncat and show '...'
  let name = row['name'];
  if (name.length > maxName) {
    return name.slice(1, maxName) + "..."
  } else {
    return name
  }
}

function jobDetailsFormatter(fx) {
  function f(cell, row) {
    let jobId = row['id'];
    let url = fx(jobId);
    return <a href={url}>{jobId}</a>
  }
  return f;
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

class SmrtLinkStatusComponent extends React.Component {
  constructor(props) {
    super(props);
    //console.log(`Props ${JSON.stringify(this.props)}` );
    this.loadStateFromServer = this.loadStateFromServer.bind(this);

    this.state = {
      status: "UNKNOWN",
      message: ""
    };
  }

  loadStateFromServer() {
    console.log("Load State from Server props");
    console.log(this.props);
    let client = this.props.client;
    console.log(`Getting state from ${client.baseUrl}`);
    this.setState({message: `Getting status from ${client.baseUrl}`});

    client.getStatus()
        .done((datum) => {
          console.log(`Result ${JSON.stringify(datum)}`);
          this.setState({status: datum.status, message: `${datum.message} from Version:${datum.version}`});
        })
        .fail((err) => {
          this.setState({status: "down", message: `Failed to get server status from ${client.baseUrl}`});
          console.log(`Result was error  ${JSON.stringify(err)}`)
        })
  }

  componentDidMount() {
    this.loadStateFromServer();
    setInterval(this.loadStateFromServer, 10000);
  }

  render() {
    return <div>Status:{this.state.status} {this.state.message} at {this.props.client.toUrl("")}</div>
  }
}

class AlarmComponent extends Component {

  constructor(props) {
    super(props);
    // List of Alarms
    this.state = {data: []};
  }

  componentDidMount() {
    this.props.client.getAlarms().then((alarms) => {
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
      <p>Running {this.props.summary.numRunning} Successful {this.props.summary.numSuccessful} Failed: {this.props.summary.numFailed} Created: {this.props.summary.numCreated}</p>
    </div>
  }
}

class JobTableComponent extends Component {
  constructor(props){
    super(props);
    this.state = {
      data: []
    };
  };

  componentDidMount() {
    this.props.client
        .getJobsByType(this.props.jobType)
        .then( (json) => {
          this.setState({data: json});
        });
  };

  selectJobs(serviceJobs) {
    return serviceJobs.filter((j) => j.state === "FAILED")
        .sort((first, second) => { return first.id > second.id} )
        .slice(-this.props.maxFailedJobs)
  }

  render() {

    let jobDetailLink = jobDetailsFormatter(this.props.client.toJobUrl);

    return <div>
      <JobSummaryComponent summary={toServiceJobsToSummary(this.state.data)} />
      <h3>Most Recently Failed Jobs</h3>
      <BootstrapTable data={this.selectJobs(this.state.data)} striped={true} hover={true}>
      <TableHeaderColumn dataField="id" isKey={true} dataAlign="center" dataSort={true} >Job Id</TableHeaderColumn>
      <TableHeaderColumn dataField="id" dataFormat={jobDetailLink} >Details</TableHeaderColumn>
      <TableHeaderColumn dataField="name" dataSort={true} dataFormat={jobNameFormatter} >Name</TableHeaderColumn>
      <TableHeaderColumn dataField="state" dataSort={true}>State</TableHeaderColumn>
      <TableHeaderColumn dataField="createdAt" >Created At</TableHeaderColumn>
      <TableHeaderColumn dataField="updatedAt" >Updated At</TableHeaderColumn>
      <TableHeaderColumn dataField="runTime" >Run Time (sec)</TableHeaderColumn>
        <TableHeaderColumn dataField="smrtLinkVersion" >SL Version</TableHeaderColumn>
        <TableHeaderColumn dataField="createdBy" >CreatedBy</TableHeaderColumn>
    </BootstrapTable>
    </div>
  }


}

class App extends Component {
  render() {
    let host = "smrtlink-alpha";
    let port = 8081;
    let smrtLinkClient = new SmrtLinkClient(host, port);
    let maxFailedJobs = 15;
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
            <Panel header="SMRT Link Server Status">
              <SmrtLinkStatusComponent client={smrtLinkClient} />
            </Panel>
            <Panel header="System Alarms"  >
              <AlarmComponent client={smrtLinkClient} />
            </Panel>
            <Panel header="Analysis Jobs" >
              <JobTableComponent jobType="pbsmrtpipe" client={smrtLinkClient} maxFailedJobs={maxFailedJobs} />
            </Panel>
            <Panel header="Merge DataSet Jobs" >
              <JobTableComponent jobType="merge-datasets" client={smrtLinkClient} maxFailedJobs={maxFailedJobs}/>
            </Panel>
            <Panel header="Import DataSet Jobs" >
              <JobTableComponent jobType="import-dataset" client={smrtLinkClient} maxFailedJobs={maxFailedJobs} />
            </Panel>
            <Panel header="Fasta Convert Jobs" >
              <JobTableComponent jobType="convert-fasta-reference" client={smrtLinkClient} maxFailedJobs={maxFailedJobs} />
            </Panel>
            <Panel header="Fasta Barcodes Convert Jobs" >
              <JobTableComponent jobType="convert-fasta-barcodes" client={smrtLinkClient} maxFailedJobs={maxFailedJobs} />
            </Panel>
          </div>
        </div>
    );
  }
}

export default App;