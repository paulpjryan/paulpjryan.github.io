var Repo = React.createClass({
	render: function() {
		return (
				<div className="repo">
					<h4 className="repoName">
						<a href={this.props.url} target="_blank">{this.props.name}</a>
					</h4>
					{this.props.desc}
				</div>
			);
	}
});

var RepoList = React.createClass({
	render: function() {
		var repoNodes = this.props.data.map(function (repo) {
				return(
					<Repo name={repo.name} desc={repo.description} url={repo.html_url}>
					</Repo>
					);
		});
		return (
			<div className="RepoList">
				{repoNodes}
			</div>
			);
	}
});

var RepoBox = React.createClass({
	loadCommentsFromServer: function() {
		/*$.ajax({
			url: 'https://api.github.com/users/paulpjryan/repos',
			dataType: 'json',
			cache: false,
			success: function(data) {
				this.setState({data: data});
			}.bind(this),
			error: function(xhr, status, err) {
				console.error('URL', status, err.toString());
			}.bind(this)
		});*/
		var source = 'https://api.github.com/users/paulpjryan/repos'
		$.getJSON(source, function(result) {
			console.log('Got result of length ' + result.length);
		    if (this.isMounted()) {
		        this.setState({
		        	data: result
		        });
		    }
		}.bind(this));
	},
	getInitialState: function() {
		return {data: []};
	},
	componentDidMount: function() {
		this.loadCommentsFromServer();
	},
	render: function() {
		return (
			<div className="repoBox">
				<h3>Projects</h3>
				<RepoList data={this.state.data} />
			</div>
		);
	}
});

React.render(
	<RepoBox pollInterval={2000}/>,
	document.getElementById('main_content')
);