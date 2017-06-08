import React, {Component} from 'react';
import {HashRouter as Router, Link, Route} from 'react-router-dom';
import './App.css';

// Running into problems with fetch and Cors. Using jQuery
import jQuery from 'jquery';

// Bootstrap related components
import {Nav, Navbar, NavItem, NavDropdown, MenuItem, Panel} from 'react-bootstrap';
import { BootstrapTable, TableHeaderColumn } from 'react-bootstrap-table';


import CopyToClipboard from 'react-copy-to-clipboard';

// Datetime utils
import Moment from 'moment';
import { extendMoment } from 'moment-range';

const moment = extendMoment(Moment);

const DASHBOARD_VERSION = "0.1.12";

/**
 * Core Models
 */
class SmrtServerStatus {
  constructor(idx, uuid, version, uptime, status, message, systemVersion) {
    this.idx = idx;
    this.uuid = uuid;
    this.version = version;
    this.uptime = uptime;
    this.status = status;
    this.message = message;
    // This is pretty hacky. This should be a new model to separate concerns
    this.systemVersion = systemVersion;
  }
}

class ServiceJob {
  constructor(jobId, name, jobTypeId, state, createdAt, updatedAt, runTime, smrtLinkVersion, createdBy, path, errorMessage) {
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
    /// Option[String]
    this.errorMessage = errorMessage;

    //
    this.path = path;
  }
}

class JobEvent {
  constructor(jobId, state, eventId, eventTypeId, createdAt, message) {
    this.jobId = jobId;
    this.state = state;
    this.eventId = eventId;
    this.eventTypeId = eventTypeId;
    this.createdAt = createdAt;
    this.message = message;
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

class ServiceJobWithEvents {
  constructor(serviceJob, events) {
    this.job = serviceJob;
    this.events = events;
  }
}

class SmrtLinkSystem {
  constructor(host, port) {
    this.host = host;
    this.port = port;
    // not the greatest idea
    this.ix = `${host}-${port}`
  }
}

const SMRT_LINK_SYSTEMS = [
  new SmrtLinkSystem("smrtlink-bihourly", 8081),
  new SmrtLinkSystem("smrtlink-alpha", 8081),
  new SmrtLinkSystem("smrtlink-alpha-nightly", 8081),
  new SmrtLinkSystem("smrtlink-nightly", 8081),
  new SmrtLinkSystem("smrtlink-beta", 8081),
  new SmrtLinkSystem("smrtlink-siv", 8081),
  new SmrtLinkSystem("smrtlink-release", 9091)
];

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

  let errorMessage = o['errorMessage'];

  return new ServiceJob(o['id'], o['name'], o['jobTypeId'], o['state'], createdAt, updatedAt, runTime, smrtLinkVersion, createdBy, path, errorMessage, null)
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

function toJobEvent(o) {
  let createdAt = toDateTime(o['createdAt']);
  let state = o['state'];
  let eventId = o['eventId'];
  let eventTypeId = o['eventTypeId'];
  let message = o['message'];
  let jobId = o['jobIde'];
  return new JobEvent(jobId, state, eventId, eventTypeId, createdAt, message);
}

function toJobEvents(rawJson) {
  return rawJson.map(toJobEvent);
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

  getSmrtLinkSystemVersion() {
    // There's a bug in older versions, where the  manifests/{id} didn't work.
    function isSmrtLinkSystem(es) {
      return es['id'] === "smrtlink";
    }

    return this.fetchJson("services/manifests").then((versions) => {
      let vx = versions.find(isSmrtLinkSystem);
      if (vx === undefined) {
        console.log("Unable to get SMRT Link System Version");
        return "Unknown";
      } else {
        return vx['version'];
      }
    });
  }

  getVersions() {
    // There's a bug in older versions, where the  manifests/{id} didn't work.
    let p = this.getSmrtLinkSystemVersion().fail((err) => {
      let message = `Failed getting SL System version ${err}`;
      console.error(message);
      return message;
    });

    return p.then((systemVersion) => {
      return this.getStatus().then((status) => {
        console.log(`Got System Version ${systemVersion}`);
        status.systemVersion = systemVersion;
        return status;
      })
    });
  }

  getJobsByType(jobType) {
    return this.fetchJson(`secondary-analysis/job-manager/jobs/${jobType}`).then(toServiceJobs)
  }

  getAlarms() {
    return this.fetchJson("smrt-base/alarms").then(toServiceAlarms)
  }

  toJobEventsUrl(jobId) {
    return this.toUrl(`secondary-analysis/job-manager/jobs/${jobId}/events`)
  }

  getJobById(jobId) {
   return this.fetchJson(`secondary-analysis/job-manager/jobs/import-dataset/${jobId}`).then(toServiceJob);
  }

  getJobEvents(jobId) {
    // this is a bit of an odd interface. The Job Type doesn't matter
    return this.fetchJson(`secondary-analysis/job-manager/jobs/import-dataset/${jobId}/events`).then(toJobEvents);
  }

  getServiceJobEvents(jobId) {
    return this.getJobById(jobId).then((r1) => {
      return this.getJobEvents(jobId).then((r2) => {
        return new ServiceJobWithEvents(r1, r2)
      })});
  }

}

function jobPathFormatter(cell, row) {
  let path = row['path'];
  return <CopyToClipboard text={path}
                          onCopy={() => this.setState({copied: true})}>
    <button>Copy JobPath to clipboard</button>
  </CopyToClipboard>
}

function jobErrorFormatter(cell, row) {
  // this is pretty hacky. Need a better way
  let msg = row['errorMessage'];
  if (msg === null) {
    return "unknown"
  } else {
    return msg.slice(-200, -1)
  }
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
  return filterByStates([state]);
}

function filterByStates(states) {
  function f(job) {
    return states.includes(job.state);
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
      message: `Unable to Get status from ${props.client.baseUrl}`,
      version: "UNKNOWN",
      systemVersion: "UNKNOWN",
      uuid: "",
      uptime: 0,
    };
  }

  loadStateFromServer() {
    //console.log("Load State from Server props");
    //console.log(this.props);
    let client = this.props.client;
    //console.log(`Getting state from ${client.baseUrl}`);
    this.setState({message: `Getting status from ${client.baseUrl}`});

    client.getVersions()
        .done((datum) => {
          //console.log(`Result ${JSON.stringify(datum)}`);
          this.setState({
            status: "UP",
            message: datum.message,
            version: datum.version,
            systemVersion: datum.systemVersion,
            uuid: datum.uuid,
            uptime: datum.uptime

          });
        })
        .fail((err) => {
          this.setState({status: "DOWN", message: `Failed to get server status from ${client.baseUrl}`});
          console.log(`Result was error  ${JSON.stringify(err)}`);
        })
  }

  componentDidMount() {
    this.loadStateFromServer();
    setInterval(this.loadStateFromServer, this.props.pollInterval);
  }

  render() {
    return <div>
      <p>System : {this.props.client.toUrl("")}</p>
      <p>Status : {this.state.status} </p>
      <p>SMRT Link System Version : {this.state.systemVersion} </p>
      <p>Services Version : {this.state.version}</p>
      <p>Uptime (sec) : {this.state.uptime / 1000} </p>
      <p>Message : {this.state.message} </p>
      <p>UUID : {this.state.uuid} </p>
    </div>
  }
}

const SmrtLinkStatusComponentWithPanel = ({system, pollInterval}) => {
  return <div>
    <Panel key={system.ix} header={`System ${system.host}`} >
      <SmrtLinkStatusComponent client={new SmrtLinkClient(system.host, system.port)} pollInterval={pollInterval} />
    </Panel>
  </div>
};


const SystemListStatus = ({props}) => {
  let systems = SMRT_LINK_SYSTEMS;
  let pollInterval = 60000;
  return <div>
    { systems.map((s) => <SmrtLinkStatusComponentWithPanel system={s} key={s.ix} pollInterval={pollInterval} /> ) }
  </div>
};


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

    this.jobFilter = props.jobFilter || filterByState("FAILED");

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
    return serviceJobs.filter(this.jobFilter)
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
      {/*<TableHeaderColumn dataField="updatedAt" >Updated At</TableHeaderColumn>*/}
      <TableHeaderColumn dataField="runTime" >Run Time (sec)</TableHeaderColumn>
      <TableHeaderColumn dataField="smrtLinkVersion" >SL Version</TableHeaderColumn>
      <TableHeaderColumn dataField="createdBy" >CreatedBy</TableHeaderColumn>
      <TableHeaderColumn dataField="path" dataFormat={jobPathFormatter} >Path</TableHeaderColumn>
      <TableHeaderColumn dataField="errorMessage"dataFormat={jobErrorFormatter} >Error</TableHeaderColumn>
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
        <NavItem eventKey={1} href="#help">Help and Shortcuts</NavItem>
        <NavItem eventKey={2} href="#systems">SL Multi-System SL Status Summary</NavItem>
      </Nav>
    </Navbar>
);


const JobSummaryByType = ({match}) => {

  const host = match.params.host;
  const port = match.params.port || 8081;
  const smrtLinkClient = new SmrtLinkClient(host, port);
  const maxFailedJobs = match.params.maxFailedJobs || 50;
  const jobType = match.params.jobType || 'pbsmrtpipe';
  const header = `${jobType} Jobs`;
  // Don't filter any job states
  const jobFilter = ((j) => false);

  return <div>
    <a name="status"/>
    <Panel header="SMRT Link Server Status">
      <SmrtLinkStatusComponent client={smrtLinkClient} pollInterval={60000}/>
    </Panel>
    <a name="pbsmrtpipe"/>
    <Panel header={header} >
      <JobTableComponent jobType={jobType} client={smrtLinkClient} maxFailedJobs={maxFailedJobs} jobFilter={jobFilter} />
    </Panel>
    </div>;
};


class JobDetailByIdComponent extends Component {

  constructor(props) {
    super(props);
    this.jobId = props.jobId;
    this.client = props.client;
    this.pollInterval = 60000;

    this.loadStateFromServer = this.loadStateFromServer.bind(this);

    // This isn't idea, need to have a better way of doing this
    // by overwriting the entire state
    this.state = {
      message: null,
      jobState: null,
      jobName: null,
      jobPath: null,
    }

  }

  loadStateFromServer() {
    let jobId = this.props.jobId;


    this.client.getServiceJobEvents(jobId).done((datum) => {
      console.log(`Got Job By Id (${jobId}) ${datum}`);
      let message = `Got Service Job  ${JSON.stringify(datum)}`;
      console.log(message);
      let state = {
        jobState: datum.job.state,
        jobName: datum.job.name,
        jobError: datum.job.errorMessage,
        message: message};
      this.setState(state)
    }).fail((err) => {
      console.log(`Error getting job id ${jobId}`);
      this.setState({message: `Unable to Job ${jobId} ${err}`})
    })
  }

  componentDidMount() {
    this.loadStateFromServer();
    setInterval(this.loadStateFromServer, this.pollInterval);
  }

  render() {
    if (this.state.message != null) {
      return <div>
        <h1>Job {this.props.jobId} Details </h1>
        <ul>
          <li>Name {this.state.jobName} </li>
          <li>State {this.state.jobState}</li>
          <li>Error {this.state.jobError}</li>
        </ul>
      </div>
    } else {
      return <div>Unable to get Job Id {this.state.jobId}</div>
    }
  }
}

// This layer translates the raw params to a Component
const JobDetailByIdFromParams = ({match}) => {
  let jobId = match.params.jobId;
  let host = match.params.host;
  let port = match.params.port;
  let client = new SmrtLinkClient(host, port);
  let pollInterval = 60000;
  return <JobDetailByIdComponent jobId={jobId} client={client} pollInterval={pollInterval} />
};


const HelpPage = () => {
  return <div>
        <h2>System DashBoard Shortcuts</h2>
        <ul>
          <li><Link to="/system/smrtlink-bihourly/8081/dashboard" >SMRT Link bi-hourly Dashboard</Link></li>
          <li><Link to="/system/smrtlink-alpha/8081/dashboard" >SMRT Link Alpha Dashboard</Link></li>
          <li><Link to="/system/smrtlink-alpha-nightly/8081/dashboard" >SMRT Link Alpha Nightly Dashboard</Link></li>
          <li><Link to="/system/smrtlink-nightly/8081/dashboard" >SMRT Link Nightly Dashboard</Link></li>
          <li><Link to="/system/smrtlink-siv/8081/dashboard" >SMRT Link SIV Dashboard</Link></li>
          <li><Link to="/system/smrtlink-release/9091/dashboard" >SMRT Link SIV Release Dashboard</Link></li>
          <li><Link to="/system/localhost/8070/dashboard" >SMRT Link Localhost 8070 Dashboard</Link></li>
        </ul>
        <h2>System Recent Job Shortcuts</h2>
        <ul>
          <li><Link to="/system/smrtlink-bihourly/8081/jobs" >SMRT Link bi-hourly Recent Jobs</Link></li>
          <li><Link to="/system/smrtlink-alpha/8081/jobs" >SMRT Link Alpha Recent Jobs</Link></li>
          <li><Link to="/system/smrtlink-alpha-nightly/8081/jobs" >SMRT Link Alpha Nightly Recent Jobs</Link></li>
          <li><Link to="/system/smrtlink-nightly/8081/jobs" >SMRT Link Nightly Recent Jobs</Link></li>
          <li><Link to="/system/smrtlink-siv/8081/jobs" >SMRT Link SIV Recent Jobs</Link></li>
          <li><Link to="/system/smrtlink-release/8081/jobs" >SMRT Link SIV Recent Jobs</Link></li>
          <li><Link to="/system/locahost/8070/jobs" >SMRT Link Localhost 8070 Recent Jobs</Link></li>
        </ul>
      </div>;
};


const MainPage = ({match}) => {

  const host = match.params.host || 'smrtlink-alpha';
  const port = match.params.port || 8081;
  // This should be max jobs, not failed
  const maxFailedJobs = match.params.maxFailedJobs || 15;

  let smrtLinkClient = new SmrtLinkClient(host, port);

  return <div>
    <a name="status"/>
    <Panel header="SMRT Link Server Status">
      <SmrtLinkStatusComponent client={smrtLinkClient} pollInterval={60000}/>
    </Panel>


    {/*<a name="alarms"/>*/}
    {/*<Panel header="System Alarms"  >*/}
      {/*<AlarmComponent client={smrtLinkClient} />*/}
    {/*</Panel>*/}

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
    <a name="db-backup"/>
    <Panel header="PostGres DB Backup" >
      <JobTableComponent jobType="db-backup" client={smrtLinkClient} maxFailedJobs={maxFailedJobs} />
    </Panel>
  </div>;
};


class App extends Component {
  render() {
    return (
        <div>
          {navbarInstance}
          <div className="container-fluid maxWidth">

            <Router>
              <div>
                <Route path="/systems" exact={true} component={SystemListStatus} />
                <Route path="/" exact={true} component={MainPage}/>
                <Route path="/help" exact={true} component={HelpPage} />
                <Route path="/system/:host/:port/dashboard" exact={true} component={MainPage}/>
                <Route path="/system/:host/:port/jobs" exact={true} component={JobSummaryByType}/>
                <Route path="/system/:host/:port/jobs/:jobId" exact={true} component={JobDetailByIdFromParams}/>
              </div>
            </Router>

          </div>
        </div>
    );
  }
}

export default App;