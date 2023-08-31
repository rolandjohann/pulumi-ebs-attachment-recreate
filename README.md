# pulumi

## 1. Reproduce issue
```shell
pulumi up

# update ./cloud-init/cloud-config.yaml
echo "# update $(date +"%Y-%m-%dT%H:%M:%S%z")" >> ./cloud-init/cloud-config.yaml

# apply changes
pulumi up --logtostderr -v=9 2> out.txt

# Previewing update (dev)
# 
# View in Browser (Ctrl+O): https://app.pulumi.com/[...]
# 
#      Type                         Name                       Plan        Info
#      pulumi:pulumi:Stack          infra-getting-started-dev              
#  +-  ├─ aws:ec2:Instance          web                        replace     [diff: ~userData]
#  +-  ├─ aws:ec2:VolumeAttachment  web-analytics-data         replace     [diff: ~instanceId]
#  ~   └─ aws:ec2:Eip               web                        update      [diff: ~instance]
# 
# 
# Resources:
#     ~ 1 to update
#     +-2 to replace
#     3 changes. 18 unchanged

# after approve:
#
#      Type                         Name                       Status                   Info
#      pulumi:pulumi:Stack          infra-getting-started-dev  **failed**               1 error
#  +-  ├─ aws:ec2:Instance          web                        replaced (0.00s)         [diff: ~userData]
#  +-  ├─ aws:ec2:VolumeAttachment  web-analytics-data         **replacing failed**     [diff: ~instanceId]; 1 error
#  ~   └─ aws:ec2:Eip               web                        updated (3s)             [diff: ~instance]
# 
# 
# Diagnostics:
#   aws:ec2:VolumeAttachment (web-analytics-data):
#     error: 1 error occurred:
#         * attaching EBS Volume (vol-01b6dd0494b4131d6) to EC2 Instance (i-044f01838fcf668aa): VolumeInUse: vol-01b6dd0494b4131d6 is already attached to an instance
#         status code: 400, request id: 334ceb18-f1f6-4109-8346-e3033f8a25b5
# 
#   pulumi:pulumi:Stack (infra-getting-started-dev):
#     error: update failed
# 
# Outputs:
#     webStaticPublicIP: "3.120.78.197"
# 
# Resources:
#     ~ 1 updated
#     +-1 replaced
#     2 changes. 18 unchanged
# 
# Duration: 27s
# 

# result:
#  - a new EC2 instance is present at AWS
#  - the old is still present at AWS with the EBS volume attached
#  - pulumi won't detach the EBS volume from old instance before attaching to another instance
#  - pulumi won't stop the old instance to prepare recreation of VolumeAttachment
```

## 2. Fix Issue to be able to operate the infrastructure
```shell
# remove VolumeAttachment
git apply fix-issue-cause.patch
pulumi up

# reintroduce VolumeAttachment
git checkout index.ts
pulumi up
```

## 3. Workaround issue
```shell
git apply workaround.patch

# update cloud-config to trigger EC2 replacement
echo "# update $(date +"%Y-%m-%dT%H:%M:%S%z")" >> ./cloud-init/cloud-config.yaml

pulumi up
```

## Observations
* when deleting the `VolumeAttachment`, the EC2 instance will be stopped prior to actual deletion - it seems that this won't be done at recreate
* when EC2 Instance configured to `deleteBeforeReplace = true` and VolumeAttachment `stopInstanceBeforeDetaching = true`, then a replacement of the EC2 Instance will first stop the old, detach the volume, replace the EC2 instance by old delete & create new, attach Volume
