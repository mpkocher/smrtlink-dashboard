import React, {Component} from 'react';
import './App.css';

// Running into problems with fetch and Cors. Using jQuery
import jQuery from 'jquery';

// Bootstrap related components
import {Nav, Navbar, NavItem, NavDropdown, MenuItem, Panel} from 'react-bootstrap';
import { BootstrapTable, TableHeaderColumn } from 'react-bootstrap-table';

// Plotting Util
import {VictoryBar, VictoryChart, VictoryTheme} from 'victory';

import CopyToClipboard from 'react-copy-to-clipboard';

// Datetime utils
import Moment from 'moment';
import { extendMoment } from 'moment-range';

const moment = extendMoment(Moment);

const DASHBOARD_VERSION = "0.1.8";

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
  constructor(jobId, name, jobTypeId, state, createdAt, updatedAt, runTime, smrtLinkVersion, createdBy, path) {
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
    this.createdBy = createdBy;

    //
    this.path = path;
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
  constructor(id, name, state, updatedAt, message) {
    this.id = id;
    this.name = name;
    this.state = state;
    this.updatedAt = updatedAt;
    this.message = message;
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
  let path = o['path'];

  let runTime = moment.duration(updatedAt.diff(createdAt)).asSeconds();

  let smrtLinkVersion = (o['smrtlinkVersion'] === null) ? "UNKNOWN" : o['smrtlinkVersion'];

  return new ServiceJob(o['id'], o['name'], o['jobTypeId'], o['state'], createdAt, updatedAt, runTime, smrtLinkVersion, createdBy, path)
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

function toMockAlarms() {
  let a1 = new Alarm("smrtlink.alarms.tmp_dir", "Temp Directory", "WARNING", new Date(), "Temporary Directory (/tmp) is 93% full");
  let a2 = new Alarm("smrtlink.alarms.job_root", "Job Root", "INFO", new Date(), "Job Directory is 27% full");

  return [a1, a2];
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

    // Bind to get callee scope to work as expected
    this.toUrl = this.toUrl.bind(this);
    this.toJobUrl = this.toJobUrl.bind(this);
    this.toJobUIUrl = this.toJobUIUrl.bind(this);

  }

  toUrl(segment) {
    return `${this.baseUrl}/${segment}`;
  }

  toJobUrl(jobId) {
    return this.toUrl(`secondary-analysis/job-manager/jobs/${jobId}`);
  }

  toJobUIUrl(jobId) {
    // FIXME. This shouldn't be hardcoded
    return `https://${this.host}:8243/sl/#/analysis/job/${jobId}`;
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

function jobPathFormatter(cell, row) {
  let path = row['path'];
  return <CopyToClipboard text={path}
                          onCopy={() => this.setState({copied: true})}>
    <button>Copy to clipboard</button>
  </CopyToClipboard>
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

/**
 * Filter Jobs by createdAt N hours ago
 * @param serviceJobs
 * @param hoursAgo
 */
function filterByHoursAgo(serviceJobs, hoursAgo) {
  let now = moment(new Date());
  return serviceJobs.filter((job) => {return moment.duration(now.diff(job.createdAt)).asHours() <= hoursAgo});
}

class SmrtLinkStatusComponent extends React.Component {
  constructor(props) {
    super(props);
    //console.log(`Props ${JSON.stringify(this.props)}` );
    this.loadStateFromServer = this.loadStateFromServer.bind(this);

    this.state = {
      status: "UNKNOWN",
      message: "",
      version: ""
    };
  }

  loadStateFromServer() {
    //console.log("Load State from Server props");
    //console.log(this.props);
    let client = this.props.client;
    //console.log(`Getting state from ${client.baseUrl}`);
    this.setState({message: `Getting status from ${client.baseUrl}`});

    client.getStatus()
        .done((datum) => {
          //console.log(`Result ${JSON.stringify(datum)}`);
          this.setState({status: datum.status, message: datum.message, version: datum.version});
        })
        .fail((err) => {
          this.setState({status: "down", message: `Failed to get server status from ${client.baseUrl}`});
          console.log(`Result was error  ${JSON.stringify(err)}`)
        })
  }

  componentDidMount() {
    this.loadStateFromServer();
    setInterval(this.loadStateFromServer, this.props.pollInterval);
  }

  render() {
    return <div>
      <p>Status:  {this.state.status} {this.state.message}</p>
      <p>System:  {this.props.client.toUrl("")}</p>
      <p>Version: {this.state.version}</p>
    </div>
  }
}

class AlarmComponent extends Component {

  constructor(props) {
    super(props);
    this.mockAlarms = toMockAlarms();
    // List of Alarms
    this.state = {data: []};
  }

  componentDidMount() {
    this.props.client.getAlarms().then((alarms) => {
          this.setState({data: alarms});
        });
  };

  render() {
    return  <BootstrapTable data={this.mockAlarms} striped={true} hover={true}>
      <TableHeaderColumn dataField="id" isKey={true} dataAlign="center" dataSort={true}>Alarm Id</TableHeaderColumn>
      <TableHeaderColumn dataField="name" dataSort={true}>Name</TableHeaderColumn>
      <TableHeaderColumn dataField="state" dataSort={true}>State</TableHeaderColumn>
      <TableHeaderColumn dataField="updatedAt" >Updated At</TableHeaderColumn>
      <TableHeaderColumn dataField="message" >Detail Message</TableHeaderColumn>
    </BootstrapTable>
  }

}

// This turned out to be not very useful
class JobSummaryComponent extends Component {

  toVictoryDatum(jobSummary) {
    return [
      {name: "Failed", count: jobSummary.numFailed},
      {name: "Running", count: jobSummary.numRunning},
      {name: "Successful", count: jobSummary.numSuccessful},
      {name: "Created", count: jobSummary.numCreated}
    ]
  }

  render() {
    return <div>
      <h4>{this.props.title} Summary (total {this.props.summary.total})</h4>
      <p>Running:{this.props.summary.numRunning} Successful:{this.props.summary.numSuccessful} Failed:{this.props.summary.numFailed} Created: {this.props.summary.numCreated}</p>
      <VictoryChart theme={VictoryTheme.material}
                    responsive={false}
                    height={200}
                    width={280}
                    padding={50} >
        <VictoryBar
            theme={VictoryTheme.material}
            style={{
              labels: {
                fontSize: 8,
              }
            }}
            data={this.toVictoryDatum(this.props.summary)}
            x="name"
            y={(datum) => datum.count}
        />
      </VictoryChart>
    </div>
  }
}

/**
 * Simple Job Summary. If any job has failed, an "alert" bootstrap
 * message will be displayed.
 */
class JobSimpleSummaryComponent extends Component {

  toMessage() {
    return `${this.props.title} Failed:${this.props.summary.numFailed} Successful:${this.props.summary.numSuccessful} Running:${this.props.summary.numRunning} Created:${this.props.summary.numCreated} Total:${this.props.summary.total}`;
  }

  render() {
    if (this.props.summary.numFailed === 0) {
      return <div className="alert alert-success" role="alert">{this.toMessage()}</div>
    } else {
      return <div className="alert alert-danger" role="alert">{this.toMessage()}</div>
    }
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

  /**
   * Filter only the most recent Failed jobs.
   * @param serviceJobs
   * @returns {Array.<ServiceJob>}
   */
  selectJobs(serviceJobs) {
    return serviceJobs.filter((j) => j.state === "FAILED")
        .sort((first, second) => { return first.id > second.id} )
        .slice(-this.props.maxFailedJobs)
  }

  render() {

    let jobDetailLink = jobDetailsFormatter(this.props.client.toJobUrl);
    let jobUILink = jobDetailsFormatter(this.props.client.toJobUIUrl);

    return <div>
      <JobSimpleSummaryComponent summary={toServiceJobsToSummary(filterByHoursAgo(this.state.data, 24))} title={"Jobs in the last 24 Hours"} />
      <JobSimpleSummaryComponent summary={toServiceJobsToSummary(filterByHoursAgo(this.state.data, 24 * 3))} title={"Jobs in the last 72 Hours"} />
      <JobSimpleSummaryComponent summary={toServiceJobsToSummary(filterByHoursAgo(this.state.data, 24 * 7))} title={"Jobs in the last Week"} />
      <JobSimpleSummaryComponent summary={toServiceJobsToSummary(this.state.data)} title={"All Jobs"} />
      <h4>Recently Failed Jobs</h4>
      <BootstrapTable data={this.selectJobs(this.state.data)} striped={true} hover={true}>
      <TableHeaderColumn dataField="id" isKey={true} dataAlign="center" dataSort={true} >Job Id</TableHeaderColumn>
      <TableHeaderColumn dataField="id" dataFormat={jobDetailLink} >Service Details</TableHeaderColumn>
      <TableHeaderColumn dataField="id" dataFormat={jobUILink} >UI</TableHeaderColumn>
      <TableHeaderColumn dataField="name" dataSort={true} dataFormat={jobNameFormatter} >Name</TableHeaderColumn>
      <TableHeaderColumn dataField="state" dataSort={true}>State</TableHeaderColumn>
      <TableHeaderColumn dataField="createdAt" >Created At</TableHeaderColumn>
      <TableHeaderColumn dataField="updatedAt" >Updated At</TableHeaderColumn>
      <TableHeaderColumn dataField="runTime" >Run Time (sec)</TableHeaderColumn>
      <TableHeaderColumn dataField="smrtLinkVersion" >SL Version</TableHeaderColumn>
      <TableHeaderColumn dataField="createdBy" >CreatedBy</TableHeaderColumn>
      <TableHeaderColumn dataField="path" dataFormat={jobPathFormatter} >Path</TableHeaderColumn>
    </BootstrapTable>
    </div>
  }
}

const navbarInstance = (
    <Navbar inverse={true} >
      <Navbar.Header>
        <Navbar.Brand>
          <a href="#">SMRT Link Diagnostic Dashboard {DASHBOARD_VERSION} </a>
        </Navbar.Brand>
      </Navbar.Header>
      <Nav>
        <NavItem eventKey={1} href="#status">Status</NavItem>
        <NavItem eventKey={2} href="#alarms">Alarms</NavItem>
        <NavDropdown eventKey={3} title="Job Types" id="basic-nav-dropdown">
          <MenuItem eventKey={3.1} href="#pbsmrtpipe">Analysis Jobs</MenuItem>
          <MenuItem eventKey={3.2} href="#merge-datasets">Merge DataSet Jobs</MenuItem>
          <MenuItem eventKey={3.3} href="#import-dataset">Import DataSet Jobs</MenuItem>
          <MenuItem eventKey={3.4} href="#convert-fasta-reference">Fasta Convert Jobs</MenuItem>
          <MenuItem eventKey={3.5} href="#convert-fasta-barcodes">Barcode Fasta Convert Jobs</MenuItem>
          <MenuItem eventKey={3.5} href="#delete-job">Delete Analysis Jobs</MenuItem>
          <MenuItem eventKey={3.5} href="#export-datasets">Export DataSet Jobs</MenuItem>
          <MenuItem eventKey={3.5} href="#tech-support-status">TS System Status Jobs</MenuItem>
          <MenuItem eventKey={3.5} href="#tech-support-job">TS Bundle Failed Jobs</MenuItem>
        </NavDropdown>
      </Nav>
    </Navbar>
);



class App extends Component {
  render() {
    let host = "smrtlink-alpha";
    //let host = "localhost";
    let port = 8081;
    let smrtLinkClient = new SmrtLinkClient(host, port);
    let maxFailedJobs = 15;
    return (
        <div>
          {navbarInstance}
          <div className="container">
            <a name="status"/>
            <Panel header="SMRT Link Server Status">
              <SmrtLinkStatusComponent client={smrtLinkClient} pollInterval={10000}/>
            </Panel>
            <a name="alarms"/>
            <Panel header="System Alarms"  >
              <AlarmComponent client={smrtLinkClient} />
            </Panel>
            <a name="pbsmrtpipe"/>
            <Panel header="Analysis Jobs" >
              <JobTableComponent jobType="pbsmrtpipe" client={smrtLinkClient} maxFailedJobs={maxFailedJobs} />
            </Panel>
            <a name="merge-datasets"/>
            <Panel header="Merge DataSet Jobs" >
              <JobTableComponent jobType="merge-datasets" client={smrtLinkClient} maxFailedJobs={maxFailedJobs}/>
            </Panel>
            <a name="import-dataset"/>
            <Panel header="Import DataSet Jobs" >
              <JobTableComponent jobType="import-dataset" client={smrtLinkClient} maxFailedJobs={maxFailedJobs} />
            </Panel>
            <a name="convert-fasta-reference"/>
            <Panel header="Fasta Convert Jobs" >
              <JobTableComponent jobType="convert-fasta-reference" client={smrtLinkClient} maxFailedJobs={maxFailedJobs} />
            </Panel>
            <a name="convert-fasta-barcodes"/>
            <Panel header="Fasta Barcodes Convert Jobs" >
              <JobTableComponent jobType="convert-fasta-barcodes" client={smrtLinkClient} maxFailedJobs={maxFailedJobs} />
            </Panel>
            <a name="delete-job"/>
            <Panel header="Delete Analysis Jobs" >
              <JobTableComponent jobType="delete-job" client={smrtLinkClient} maxFailedJobs={maxFailedJobs} />
            </Panel>
            <a name="export-datasets"/>
            <Panel header="Export DataSet Jobs" >
              <JobTableComponent jobType="export-datasets" client={smrtLinkClient} maxFailedJobs={maxFailedJobs} />
            </Panel>
            <a name="tech-support-status"/>
            <Panel header="TechSupport System Status Bundle Jobs" >
              <JobTableComponent jobType="tech-support-status" client={smrtLinkClient} maxFailedJobs={maxFailedJobs} />
            </Panel>
            <a name="tech-support-job"/>
            <Panel header="Tech Support Failed Job Bundle" >
              <JobTableComponent jobType="tech-support-job" client={smrtLinkClient} maxFailedJobs={maxFailedJobs} />
            </Panel>
          </div>
        </div>
    );
  }
}

export default App;