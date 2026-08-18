const { buildProjectCICDData } = require('../routes/admin');

describe('CI/CD project data', () => {
  test('should calculate pipeline data from the actual repository instead of fixed mock values', () => {
    const data = buildProjectCICDData();

    expect(Array.isArray(data.pipelines)).toBe(true);
    expect(data.pipelines.length).toBeGreaterThan(0);
    expect(data.stats.activePipelines).toBe(data.pipelines.filter((pipeline) => pipeline.status === 'running').length);
    expect(data.stats.successfulBuilds + data.stats.failedBuilds + data.stats.activePipelines).toBe(data.pipelines.length);
    expect(data.recentBuilds.length).toBeGreaterThan(0);
  });
});
