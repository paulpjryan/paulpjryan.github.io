var Repo = React.createClass({
	render: function() {
		return (
				<div className="repo">
					<h4 className="repoName">
						{this.props.name}
					</h4>
				</div>
			);
	}
});

var RepoList = React.createClass({
	render: function() {
		var repoNodes = this.props.data.map(function (repo) {
				return(
					<Repo name={repo.name}>
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