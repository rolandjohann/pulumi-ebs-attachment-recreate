import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as cloudinit from "@pulumi/cloudinit";
import * as fs from "fs";
import * as path from "path";

const dataDiskDeviceName = '/dev/xvdb'

const vpc = new awsx.ec2.Vpc("infra-getting-started", {
  cidrBlock: "10.0.0.0/16",
  natGateways: {
    strategy: awsx.ec2.NatGatewayStrategy.None,
  },
  subnetSpecs: [
    {
      type: awsx.ec2.SubnetType.Public,
      cidrMask: 28,
      name: "web",
    },
  ],
});

const webSecurityGroup = new aws.ec2.SecurityGroup("web-public", {
  vpcId: vpc.vpc.id,
  ingress: [
    {
      protocol: "tcp",
      fromPort: 22,
      toPort: 22,
      cidrBlocks: ["0.0.0.0/0"],
    },
    {
      protocol: 'tcp',
      fromPort: 80,
      toPort: 80,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  egress: [
    {
      protocol: "-1",
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ["0.0.0.0/0"],
    }
  ],
});

const webCloudData = cloudinit.getConfigOutput({
  gzip: true,
  parts: [
    {
      contentType: 'text/cloud-config',
      content: fs.readFileSync(path.resolve(path.join(__dirname, 'cloud-init', 'cloud-config.yaml')), 'utf-8'),
    },
  ]
})

const ami = aws.ec2.getAmi({
  filters: [
    {
      name: "description",
      values: ["Amazon Linux 2023 AMI*"]
    },
    {
      name: "architecture",
      values: ["arm64"]
    },
  ],
  owners: ["137112412989"],
  mostRecent: true,
});

const webInstance = new aws.ec2.Instance("web", {
  ami: ami.then(ami => ami.id),
  instanceType: "t4g.micro",
  vpcSecurityGroupIds: [webSecurityGroup.id],
  subnetId: vpc.publicSubnetIds.apply(ids => ids[0]),
  userData: webCloudData.apply(cloudInit => cloudInit.rendered),
  userDataReplaceOnChange: true,
  associatePublicIpAddress: true,
  rootBlockDevice: {
    deleteOnTermination: true,
    volumeSize: 8,
  },
}, {
  // necessary since volumeDetachment doesn't seem to respect stopInstanceBeforeDetaching
  deleteBeforeReplace: true
});

const webDataEbs = new aws.ebs.Volume("web", {
  type: 'gp3',
  size: 100,
  availabilityZone: vpc.subnets.apply(x => x[0].availabilityZone)
})

//  replacing the ec2 instance results in the attachment not being replaced.
//  The replacement crashes with the message that the volume is attached to the old instance
const webDataVolumeAttachment = new aws.ec2.VolumeAttachment('web-analytics-data', {
  instanceId: webInstance.id,
  volumeId: webDataEbs.id,
  deviceName: dataDiskDeviceName,

  // doesn't do anything
  stopInstanceBeforeDetaching: true,
})

const webEIP = new aws.ec2.Eip('web', {
  vpc: true,
  instance: webInstance.id,
})

export const webStaticPublicIP = webEIP.publicIp;
